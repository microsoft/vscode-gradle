import * as vscode from 'vscode';
import getPort from 'get-port';

import { logger } from './logger';
import { buildGradleServerTask } from './tasks';

export interface ServerOptions {
  host: string;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export class GradleTasksServer implements vscode.Disposable {
  private taskExecution: vscode.TaskExecution | undefined;

  private _onStart: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
  public readonly onStart: vscode.Event<null> = this._onStart.event;

  private port: number | undefined;
  private taskName = 'Gradle Server';

  constructor(
    private readonly opts: ServerOptions,
    private readonly context: vscode.ExtensionContext
  ) {
    context.subscriptions.push(
      vscode.tasks.onDidStartTaskProcess(event => {
        if (event.execution.task.name === this.taskName && event.processId) {
          if (isProcessRunning(event.processId)) {
            logger.info('Gradle server started');
            // The server process is running, but it can take a little while for the
            // server to start. So let's wait some arbitrary time to increase the chances
            // of a successful first connect from the client.
            setTimeout(() => this._onStart.fire(), 400);
          } else {
            logger.error('Error starting gradle server');
          }
        }
      }),
      vscode.tasks.onDidEndTaskProcess(event => {
        if (event.execution.task.name === this.taskName) {
          logger.info(`Gradle server stopped`);
          this.showRestartMessage();
        }
      })
    );
  }

  public async start(): Promise<void> {
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
      this.start();
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
  context: vscode.ExtensionContext
): GradleTasksServer {
  const server = new GradleTasksServer(opts, context);
  server.start();
  return server;
}
