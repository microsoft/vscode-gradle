import * as vscode from 'vscode';
import * as util from 'util';
import getPort from 'get-port';
import { isTaskRunning } from '../tasks/taskUtil';
import { waitOnTcp, isTest } from '../util';
import { logger, LoggerStream, LogVerbosity } from '../logger';
import { Extension } from '../extension';
import { Output } from '../proto/gradle_pb';
import { COMMAND_CANCEL_TASK } from '../commands';
import { ServiceError } from '@grpc/grpc-js';

const NL = '\n';
const CR = '\r';
const nlRegExp = new RegExp(`${NL}([^${CR}])`, 'g');

export class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  public readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private readonly closeEmitter = new vscode.EventEmitter<void>();
  private task?: vscode.Task;
  public readonly onDidClose?: vscode.Event<void> = this.closeEmitter.event;
  private stdOutLoggerStream: LoggerStream;

  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly projectFolder: vscode.Uri
  ) {
    // TODO: this is only needed for the tests. Find a better way to test task output in the tests.
    this.stdOutLoggerStream = new LoggerStream(logger, LogVerbosity.INFO);
  }

  public setTask(task: vscode.Task): void {
    this.task = task;
  }

  public open(): void {
    this.doBuild();
  }

  public close(): void {
    if (this.task && isTaskRunning(this.task)) {
      vscode.commands.executeCommand(COMMAND_CANCEL_TASK, this.task);
    }
  }

  private async startJavaDebug(javaDebugPort: number): Promise<void> {
    try {
      await waitOnTcp('localhost', javaDebugPort);
      const startedDebugging = await vscode.debug.startDebugging(
        this.workspaceFolder,
        {
          type: 'java',
          name: 'Debug (Attach) via Gradle Tasks',
          request: 'attach',
          hostName: 'localhost',
          port: javaDebugPort,
        }
      );
      if (!startedDebugging) {
        throw new Error('The debugger was not started');
      }
    } catch (err) {
      logger.error('Unable to start Java debugging:', err.message);
      this.close();
    }
  }

  private async doBuild(): Promise<void> {
    const args: string[] = this.task!.definition.args.split(' ').filter(
      Boolean
    );
    try {
      const javaDebugEnabled = this.task!.definition.javaDebug;
      const javaDebugPort = javaDebugEnabled ? await getPort() : 0;
      const runTask = Extension.getInstance()
        .getClient()
        .runTask(
          this.projectFolder.fsPath,
          this.task!,
          args,
          '',
          javaDebugPort,
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

  public handleInput(data: string): void {
    // sigint eg cmd/ctrl+C
    if (data === '\x03') {
      vscode.commands.executeCommand(COMMAND_CANCEL_TASK, this.task);
    }
  }

  private write(message: string): void {
    // Note writing `\n` will just move the cursor down 1 row.
    // We need to write `\r` as well to move the cursor to the left-most cell.
    const sanitisedMessage = message.replace(nlRegExp, `${NL + CR}$1`);
    this.writeEmitter.fire(sanitisedMessage);
  }
}
