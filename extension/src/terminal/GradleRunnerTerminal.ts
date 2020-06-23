import * as vscode from 'vscode';
import * as util from 'util';
import { isTest, waitOnTcp } from '../util';
import { logger, LoggerStream, LogVerbosity } from '../logger';
import { Output } from '../proto/gradle_pb';
import { ServiceError } from '@grpc/grpc-js';
import { RootProject } from '../rootProject/RootProject';
import { isTaskRunning } from '../tasks/taskUtil';
import getPort from 'get-port';
import { Extension } from '../extension';
import { COMMAND_CANCEL_BUILD } from '../commands';
import { GradleTaskDefinition } from '../tasks';

const NL = '\n';
const CR = '\r';
const nlRegExp = new RegExp(`${NL}([^${CR}]|$)`, 'g');

export class GradleRunnerTerminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private stdOutLoggerStream: LoggerStream;
  private readonly closeEmitter = new vscode.EventEmitter<void>();
  private task?: vscode.Task;
  public readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  public readonly onDidClose?: vscode.Event<void> = this.closeEmitter.event;

  constructor(
    private readonly rootProject: RootProject,
    private readonly args: string[],
    private readonly cancellationKey: string
  ) {
    // TODO: this is only needed for the tests. Find a better way to test task output in the tests.
    this.stdOutLoggerStream = new LoggerStream(logger, LogVerbosity.INFO);
  }

  public async open(): Promise<void> {
    await this.runBuild();
  }

  public setTask(task: vscode.Task): void {
    this.task = task;
  }

  public async close(): Promise<void> {
    if (this.task && isTaskRunning(this.task)) {
      await this.cancelCommand();
    }
  }

  private async startJavaDebug(javaDebugPort: number): Promise<void> {
    try {
      await waitOnTcp('localhost', javaDebugPort);
      const definition = this.task?.definition as GradleTaskDefinition;
      const projectName = definition ? definition.project : undefined;
      const debugConfig = {
        type: 'java',
        name: 'Debug (Attach) via Gradle Tasks',
        request: 'attach',
        hostName: 'localhost',
        port: javaDebugPort,
        projectName,
      };
      const startedDebugging = await vscode.debug.startDebugging(
        this.rootProject.getWorkspaceFolder(),
        debugConfig
      );
      if (!startedDebugging) {
        throw new Error('The debugger was not started');
      }
    } catch (err) {
      logger.error('Unable to start Java debugging:', err.message);
      await this.close();
    }
  }

  private async runBuild(): Promise<void> {
    const javaDebugEnabled = this.task ? this.task.definition.javaDebug : false;
    try {
      const javaDebugPort = javaDebugEnabled ? await getPort() : 0;
      const runTask = Extension.getInstance()
        .getClient()
        .runBuild(
          this.rootProject.getProjectUri().fsPath,
          this.cancellationKey,
          this.args,
          '',
          javaDebugPort,
          this.task,
          this.handleOutput,
          true
        );
      if (javaDebugEnabled) {
        await this.startJavaDebug(javaDebugPort);
      }
      await runTask;
    } catch (e) {
      this.handleError(e);
    } finally {
      this.closeEmitter.fire();
    }
  }

  private async cancelCommand(): Promise<void> {
    await vscode.commands.executeCommand(
      COMMAND_CANCEL_BUILD,
      this.cancellationKey,
      this.task
    );
  }

  private handleOutput = (output: Output): void => {
    const messageBytes = output.getOutputBytes_asU8();
    if (messageBytes.length) {
      if (isTest()) {
        this.stdOutLoggerStream.write(messageBytes);
      }
      this.write(new util.TextDecoder('utf-8').decode(messageBytes));
    }
  };

  private handleError(err: ServiceError): void {
    this.write(err.details || err.message);
  }

  public async handleInput(data: string): Promise<void> {
    // sigint eg cmd/ctrl+C
    if (data === '\x03') {
      await this.cancelCommand();
    }
  }

  private write(message: string): void {
    // Note writing `\n` will just move the cursor down 1 row.
    // We need to write `\r` as well to move the cursor to the left-most cell.
    const sanitisedMessage = message.replace(nlRegExp, `${NL + CR}$1`);
    this.writeEmitter.fire(sanitisedMessage);
  }
}
