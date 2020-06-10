import * as vscode from 'vscode';
import getPort from 'get-port';
import { SERVER_TASK_NAME, buildGradleServerTask } from './serverUtil';
import { isDebuggingServer } from '../util';
import { logger } from '../logger/index';

export interface ServerOptions {
  host: string;
}

export class GradleServer implements vscode.Disposable {
  private taskExecution?: vscode.TaskExecution;
  private readonly _onDidStart: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private readonly _onDidStop: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private restarting = false;
  private ready = false;
  private port: number | undefined;

  public readonly onDidStart: vscode.Event<null> = this._onDidStart.event;
  public readonly onDidStop: vscode.Event<null> = this._onDidStop.event;

  constructor(
    private readonly opts: ServerOptions,
    private readonly context: vscode.ExtensionContext
  ) {
    context.subscriptions.push(
      vscode.tasks.onDidStartTaskProcess(async (event) => {
        if (event.execution.task.name === SERVER_TASK_NAME) {
          this.fireOnStart();
        }
      }),
      vscode.tasks.onDidEndTaskProcess((event) => {
        if (event.execution.task.name === SERVER_TASK_NAME) {
          this.ready = false;
          this._onDidStop.fire(null);
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
      this.fireOnStart();
    } else {
      this.port = await getPort();
      const cwd = this.context.asAbsolutePath('lib');
      const task = buildGradleServerTask(cwd, [String(this.port)]);
      logger.debug('Starting server');
      try {
        this.taskExecution = await vscode.tasks.executeTask(task);
        if (!this.taskExecution) {
          throw new Error('Task execution not found');
        }
      } catch (e) {
        logger.error('There was an error starting the server:', e.message);
      }
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
    if (this.restarting) {
      return;
    }
    logger.info('Restarting gradle server');
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

  private fireOnStart(): void {
    logger.info('Gradle server started');
    this.ready = true;
    this._onDidStart.fire(null);
  }

  public dispose(): void {
    this.taskExecution?.terminate();
    this._onDidStart.dispose();
    this._onDidStop.dispose();
  }

  public getPort(): number | undefined {
    return this.port;
  }

  public getOpts(): ServerOptions {
    return this.opts;
  }
}
