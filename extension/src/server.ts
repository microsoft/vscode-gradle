import * as vscode from 'vscode';
import * as getPort from 'get-port';
import * as nls from 'vscode-nls';

import { logger } from './logger';
import { buildGradleServerTask } from './tasks';

const localize = nls.loadMessageBundle();
const isDebuggingServer = (): boolean =>
  process.env.VSCODE_DEBUGGING_SERVER?.toLowerCase() === 'true';

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

  private _onReady: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
  private _onStop: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
  public readonly onReady: vscode.Event<null> = this._onReady.event;
  public readonly onStop: vscode.Event<null> = this._onStop.event;

  private isRestarting = false;
  private port: number | undefined;
  private taskName = 'Gradle Tasks Server';

  constructor(
    private readonly opts: ServerOptions,
    private readonly context: vscode.ExtensionContext
  ) {
    context.subscriptions.push(
      vscode.tasks.onDidStartTaskProcess((event) => {
        if (event.execution.task.name === this.taskName && event.processId) {
          if (isProcessRunning(event.processId)) {
            this.fireOnReady();
          } else {
            logger.error(
              localize(
                'server.gradleServerErrorStarting',
                'Error starting gradle server'
              )
            );
          }
        }
      }),
      vscode.tasks.onDidEndTaskProcess((event) => {
        if (event.execution.task.name === this.taskName) {
          this._onStop.fire();
          if (!this.isRestarting) {
            logger.info(
              localize('server.gradleServerStopped', 'Gradle server stopped')
            );
            this.taskExecution = undefined;
            this.showRestartMessage();
          }
        }
      })
    );
  }

  public async start(): Promise<void> {
    if (isDebuggingServer()) {
      this.port = 8887;
      this.fireOnReady();
    } else {
      this.port = await getPort();
      const cwd = this.context.asAbsolutePath('lib');
      const task = buildGradleServerTask(this.taskName, cwd, [
        String(this.port),
      ]);
      this.taskExecution = await vscode.tasks.executeTask(task);
    }
  }

  public async showRestartMessage(): Promise<void> {
    const OPT_RESTART = localize('server.restartServer', 'Restart Server');
    const input = await vscode.window.showErrorMessage(
      localize(
        'server.restartMessage',
        'No connection to gradle server. Try restarting the server.'
      ),
      OPT_RESTART
    );
    if (input === OPT_RESTART) {
      this.start();
    }
  }

  public restart(): void {
    logger.info('Restarting gradle server...');
    if (!this.isRestarting) {
      if (this.taskExecution) {
        this.isRestarting = true;
        const disposable = vscode.tasks.onDidEndTaskProcess((event) => {
          if (event.execution.task.name === this.taskName) {
            this.isRestarting = false;
            disposable.dispose();
            this.start();
          }
        });
        this.taskExecution.terminate();
      } else {
        this.start();
      }
    }
  }

  private fireOnReady(): void {
    logger.info(
      localize('server.gradleServerStarted', 'Gradle server started')
    );
    this._onReady.fire();
  }

  public dispose(): void {
    this.taskExecution?.terminate();
    this._onReady.dispose();
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
  context.subscriptions.push(server);

  return server;
}
