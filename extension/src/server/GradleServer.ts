import * as vscode from 'vscode';
import * as getPort from 'get-port';
import { isDebuggingServer, isProcessRunning, waitOnTcp } from '../util';
import { SERVER_TASK_NAME, buildGradleServerTask } from './serverUtil';
import { logger } from '../logger';

export interface ServerOptions {
  host: string;
}

export class GradleServer implements vscode.Disposable {
  private taskExecution?: vscode.TaskExecution;
  private _onReady: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
  private _onStop: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
  private restarting = false;
  private ready = false;
  private port: number | undefined;

  public readonly onReady: vscode.Event<null> = this._onReady.event;
  public readonly onStop: vscode.Event<null> = this._onStop.event;

  constructor(
    private readonly opts: ServerOptions,
    private readonly context: vscode.ExtensionContext
  ) {
    context.subscriptions.push(
      vscode.tasks.onDidStartTaskProcess(async (event) => {
        if (event.execution.task.name === SERVER_TASK_NAME) {
          if (isProcessRunning(event.processId)) {
            logger.debug(
              'Gradle server process started, waiting for server to start'
            );
            try {
              await waitOnTcp('localhost', this.port!);
              this.fireOnReady();
            } catch (e) {
              logger.error('Gradle server not started:', e.message);
            }
          } else {
            logger.error('Gradle server processes not started');
          }
        }
      }),
      vscode.tasks.onDidEndTaskProcess((event) => {
        if (event.execution.task.name === SERVER_TASK_NAME) {
          this.ready = false;
          this._onStop.fire(null);
          if (!this.restarting) {
            logger.info('Gradle server stopped');
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
      const task = buildGradleServerTask(cwd, [String(this.port)]);
      logger.debug('Starting server');
      this.taskExecution = await vscode.tasks.executeTask(task);
    }
  }

  public isReady(): boolean {
    return this.ready;
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

  public restart(): void {
    logger.info('Restarting gradle server');
    if (!this.restarting) {
      if (this.taskExecution) {
        this.restarting = true;
        const disposable = vscode.tasks.onDidEndTaskProcess((event) => {
          if (event.execution.task.name === SERVER_TASK_NAME) {
            this.restarting = false;
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
    logger.info('Gradle server started');
    this.ready = true;
    this._onReady.fire(null);
  }

  public dispose(): void {
    this.taskExecution?.terminate();
    this._onReady.dispose();
    this._onStop.dispose();
  }

  public getPort(): number | undefined {
    return this.port;
  }

  public getOpts(): ServerOptions {
    return this.opts;
  }
}
