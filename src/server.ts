import * as vscode from 'vscode';
import getPort from 'get-port';

import { buildGradleServerTask } from './tasks';

export interface ServerOptions {
  host: string;
}

export class GradleTasksServer implements vscode.Disposable {
  private taskExecution: vscode.TaskExecution | undefined;

  private _onStart: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
  public readonly onStart: vscode.Event<null> = this._onStart.event;

  private port: number | undefined;
  private taskName = 'Gradle Server';

  constructor(
    private readonly opts: ServerOptions,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly context: vscode.ExtensionContext
  ) {
    context.subscriptions.push(
      vscode.tasks.onDidStartTaskProcess(event => {
        if (event.execution.task.name === this.taskName) {
          if (event.processId) {
            this.outputChannel.appendLine('Gradle server started');
          }
          this._onStart.fire();
        }
      }),
      vscode.tasks.onDidEndTaskProcess(event => {
        if (event.execution.task.name === this.taskName) {
          this.outputChannel.appendLine(`Gradle server stopped`);
          this.showRestartMessage();
        }
      })
    );
  }

  public async tryStartServer(): Promise<void> {
    this.port = await getPort();
    const cwd = this.context.asAbsolutePath('lib');
    const task = buildGradleServerTask(this.taskName, cwd, [String(this.port)]);
    this.taskExecution = await vscode.tasks.executeTask(task);
  }

  public async showRestartMessage(): Promise<void> {
    const OPT_RESTART = 'Restart Server';
    const input = await vscode.window.showErrorMessage(
      'No connection to gradle server. Try restarting the server.',
      OPT_RESTART
    );
    if (input === OPT_RESTART) {
      this.tryStartServer();
    }
  }

  public dispose(): void {
    this.taskExecution?.terminate();
    this._onStart.dispose();
  }

  public getPort(): number | undefined {
    return this.port;
  }

  public getOpts(): ServerOptions {
    return this.opts;
  }
}

export function registerServer(
  opts: ServerOptions,
  outputChannel: vscode.OutputChannel,
  context: vscode.ExtensionContext
): GradleTasksServer {
  return new GradleTasksServer(opts, outputChannel, context);
}
