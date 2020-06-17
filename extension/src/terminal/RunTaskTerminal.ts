import * as vscode from 'vscode';
import getPort from 'get-port';
import { isTaskRunning } from '../tasks/taskUtil';
import { waitOnTcp } from '../util';
import { logger } from '../logger';
import { Extension } from '../extension';
import { COMMAND_CANCEL_TASK } from '../commands';
import { GradleRunnerTerminal } from './GradleRunnerTerminal';

export class RunTaskTerminal extends GradleRunnerTerminal
  implements vscode.Pseudoterminal {
  private task?: vscode.Task;

  public setTask(task: vscode.Task): void {
    this.task = task;
  }

  public close(): void {
    if (this.task && isTaskRunning(this.task)) {
      this.cancelCommand();
    }
  }

  private async startJavaDebug(javaDebugPort: number): Promise<void> {
    try {
      await waitOnTcp('localhost', javaDebugPort);
      const startedDebugging = await vscode.debug.startDebugging(
        this.rootProject.getWorkspaceFolder(),
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

  protected async runCommand(): Promise<void> {
    const args: string[] = this.task!.definition.args.split(' ').filter(
      Boolean
    );
    try {
      const javaDebugEnabled = this.task!.definition.javaDebug;
      const javaDebugPort = javaDebugEnabled ? await getPort() : 0;
      const runTask = Extension.getInstance()
        .getClient()
        .runTask(
          this.rootProject.getProjectUri().fsPath,
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

  protected cancelCommand(): void {
    vscode.commands.executeCommand(COMMAND_CANCEL_TASK, this.task);
  }
}
