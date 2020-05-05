import * as vscode from 'vscode';
import * as getPort from 'get-port';
import * as nls from 'vscode-nls';

import { logger } from './logger';
import { buildGradleServerTask } from './tasks';
import { isDebuggingServer } from './util';

const localize = nls.loadMessageBundle();

export const SERVER_TASK_NAME = 'Gradle Tasks Server';

export interface ServerOptions {
  host: string;
}

export class GradleTasksServer implements vscode.Disposable {
  private taskExecution: vscode.TaskExecution | undefined;
  private _onReady: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
  private _onStop: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
  private isRestarting = false;
  private port: number | undefined;

  public readonly onReady: vscode.Event<null> = this._onReady.event;
  public readonly onStop: vscode.Event<null> = this._onStop.event;

  constructor(
    private readonly opts: ServerOptions,
    private readonly context: vscode.ExtensionContext
  ) {
    context.subscriptions.push(
      vscode.tasks.onDidStartTask((event) => {
        if (event.execution.task.name === SERVER_TASK_NAME) {
          this.fireOnReady();
        }
      }),
      vscode.tasks.onDidEndTaskProcess((event) => {
        if (event.execution.task.name === SERVER_TASK_NAME) {
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
      const executableDir = this.context.asAbsolutePath('lib');
      const task = buildGradleServerTask(SERVER_TASK_NAME, executableDir, [
        String(this.port),
      ]);
      if (task) {
        this.taskExecution = await vscode.tasks.executeTask(task);
      }
    }
  }

  public isStarted(): boolean {
    return this.taskExecution !== null;
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
    logger.info(
      localize('server.gradleServerRestarting', 'Restarting gradle server')
    );
    if (!this.isRestarting) {
      if (this.taskExecution) {
        this.isRestarting = true;
        const disposable = vscode.tasks.onDidEndTaskProcess((event) => {
          if (event.execution.task.name === SERVER_TASK_NAME) {
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
    this._onStop.dispose();
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
  context.subscriptions.push(
    server,
    vscode.workspace.onDidChangeConfiguration(
      (event: vscode.ConfigurationChangeEvent) => {
        if (event.affectsConfiguration('java.home') && server.isStarted()) {
          server.restart();
        }
      }
    )
  );
  return server;
}
