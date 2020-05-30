import * as vscode from 'vscode';
import * as util from 'util';
import * as getPort from 'get-port';

import { waitOnTcp, isTest } from '../util';
import { logger } from '../logger';
import { LoggerStream } from '../logger/LoggerSteam';
import { Output } from '../proto/gradle_pb';
import { isTaskRunning } from '../tasks/taskUtil';
import {
  COMMAND_CANCEL_TASK,
  COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION,
} from '../commands/constants';
import { Extension } from '../extension/Extension';

export class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  public readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private readonly closeEmitter = new vscode.EventEmitter<void>();
  private task?: vscode.Task;
  public readonly onDidClose?: vscode.Event<void> = this.closeEmitter.event;

  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly projectFolder: string
  ) {}

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

  private handleOutput(messageBytes: Uint8Array): void {
    const NL = '\n';
    const CR = '\r';
    if (messageBytes.length) {
      const string = new util.TextDecoder('utf-8')
        .decode(messageBytes)
        .split('')
        .map((char: string) => {
          // Note writing `\n` will just move the cursor down 1 row.
          // We need to write `\r` as well to move the cursor to the left-most cell.
          return char === NL ? NL + CR : char;
        })
        .join('');
      this.write(string);
    }
  }

  private write(message: string): void {
    this.writeEmitter.fire(message);
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
    const stdOutLoggerStream = new LoggerStream(logger, 'info');
    const args: string[] = this.task!.definition.args.split(' ').filter(
      Boolean
    );
    try {
      const javaDebugEnabled = this.task!.definition.javaDebug;
      const javaDebugPort = javaDebugEnabled ? await getPort() : 0;
      const runTask = Extension.getInstance()
        .getClient()
        .runTask(
          this.projectFolder,
          this.task!,
          args,
          '',
          javaDebugPort,
          (output: Output): void => {
            this.handleOutput(output.getOutputBytes_asU8());
            if (isTest()) {
              stdOutLoggerStream.write(output.getOutputBytes_asU8());
            }
          },
          true
        );
      if (javaDebugEnabled) {
        await this.startJavaDebug(javaDebugPort);
      }
      await runTask;
      vscode.commands.executeCommand(
        COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION,
        vscode.Uri.file(this.task!.definition.buildFile)
      );
    } finally {
      this.closeEmitter.fire();
    }
  }

  public handleInput(data: string): void {
    // sigint eg cmd/ctrl+C
    if (data === '\x03') {
      vscode.commands.executeCommand(COMMAND_CANCEL_TASK, this.task);
    }
  }
}
