import * as WebSocket from 'ws';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const stripAnsi = require('strip-ansi');

import { getIsDebugEnabled } from './config';

import { GradleTasksServer, ServerOptions } from './server';
import { logger } from './logger';
import { handleCancelledTaskMessage } from './tasks';

import * as ClientMessage from '../lib/proto/com/github/badsyntax/gradletasks/ClientMessage_pb';
import * as ServerMessage from '../lib/proto/com/github/badsyntax/gradletasks/ServerMessage_pb';

const localize = nls.loadMessageBundle();

class WebSocketClient implements vscode.Disposable {
  private autoReconnectInterval = 1 * 1000; // ms
  private instance: WebSocket | undefined;
  private reconnectTimeout: NodeJS.Timeout | undefined;

  private _onOpen: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
  public readonly onOpen: vscode.Event<null> = this._onOpen.event;

  private _onError: vscode.EventEmitter<Error> = new vscode.EventEmitter<
    Error
  >();
  public readonly onError: vscode.Event<Error> = this._onError.event;

  private _onClose: vscode.EventEmitter<number> = new vscode.EventEmitter<
    number
  >();
  public readonly onClose: vscode.Event<number> = this._onClose.event;

  private _onMessage: vscode.EventEmitter<
    WebSocket.Data
  > = new vscode.EventEmitter<WebSocket.Data>();
  public readonly onMessage: vscode.Event<WebSocket.Data> = this._onMessage
    .event;

  private _onLog: vscode.EventEmitter<string> = new vscode.EventEmitter<
    string
  >();
  public readonly onLog: vscode.Event<string> = this._onLog.event;

  constructor(private readonly url: string) {}

  open(): void {
    this.instance = new WebSocket(this.url);
    this.instance.on('open', () => {
      this.autoReconnectInterval = 1000;
      this._onOpen.fire();
    });
    this.instance.on('message', (data: WebSocket.Data) => {
      this._onMessage.fire(data);
    });
    this.instance.on('close', code => {
      // CLOSE_NORMAL
      if (code !== 1000) {
        this.reconnect();
      }
      this._onClose.fire(code);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.instance.on('error', (err: any) => {
      if (err?.code === 'ECONNREFUSED') {
        this.reconnect();
      } else {
        this._onError.fire(err);
      }
    });
  }

  send(data: Uint8Array, callback: (err?: Error) => void): void {
    try {
      this.instance!.send(data, callback);
    } catch (err) {
      this.instance!.emit('error', err);
    }
  }

  reconnect(): void {
    this._onLog.fire(
      `WebSocketClient: retry in ${this.autoReconnectInterval}ms`
    );
    this.instance!.removeAllListeners();
    this.reconnectTimeout = setTimeout(
      () => this.open(),
      this.autoReconnectInterval
    );
    if (this.autoReconnectInterval < 5000) {
      this.autoReconnectInterval += 1000;
    }
  }

  dispose(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.instance?.removeAllListeners();
    this.instance?.close();
    this._onClose.dispose();
    this._onError.dispose();
    this._onLog.dispose();
    this._onMessage.dispose();
    this._onOpen.dispose();
  }

  getInstance(): WebSocket | undefined {
    return this.instance;
  }
}

export class GradleTasksClient implements vscode.Disposable {
  private wsClient: WebSocketClient | undefined;

  private _onConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onConnect: vscode.Event<null> = this._onConnect.event;

  private _onProgressMessage: vscode.EventEmitter<
    ServerMessage.Progress
  > = new vscode.EventEmitter<ServerMessage.Progress>();
  public readonly onProgressMessage: vscode.Event<ServerMessage.Progress> = this
    ._onProgressMessage.event;

  private _onOutputMessage: vscode.EventEmitter<
    ServerMessage.OutputChanged
  > = new vscode.EventEmitter<ServerMessage.OutputChanged>();
  public readonly onOutputMessage: vscode.Event<
    ServerMessage.OutputChanged
  > = this._onOutputMessage.event;

  private _onErrorMessage: vscode.EventEmitter<
    ServerMessage.Error
  > = new vscode.EventEmitter<ServerMessage.Error>();
  public readonly onErrorMessage: vscode.Event<ServerMessage.Error> = this
    ._onErrorMessage.event;

  private _onInfoMessage: vscode.EventEmitter<
    ServerMessage.Error
  > = new vscode.EventEmitter<ServerMessage.Error>();
  public readonly onInfoMessage: vscode.Event<ServerMessage.Error> = this
    ._onInfoMessage.event;

  private _onActionCancelledMessage: vscode.EventEmitter<
    ServerMessage.ActionCancelled
  > = new vscode.EventEmitter<ServerMessage.ActionCancelled>();
  public readonly onActionCancelledMessage: vscode.Event<
    ServerMessage.ActionCancelled
  > = this._onActionCancelledMessage.event;

  private _onMessage: vscode.EventEmitter<
    ServerMessage.Message
  > = new vscode.EventEmitter<ServerMessage.Message>();
  public readonly onMessage: vscode.Event<ServerMessage.Message> = this
    ._onMessage.event;

  public constructor(
    private readonly server: GradleTasksServer,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {
    this.onProgressMessage(this.handleProgressMessage);
    this.onOutputMessage(this.handleOutputMessage);
    this.onErrorMessage(this.handleErrorMessage);
    this.onInfoMessage(this.handleInfoMessage);
    this.server.onStart(this.handleServerStart);
    this.server.onStop(this.handleServerStop);
  }

  private handleServerStop = (): void => {
    this.statusBarItem.hide();
  };

  public handleServerStart = (): void => {
    if (this.wsClient) {
      this.wsClient.dispose();
    }

    logger.info(
      localize('client.connecting', 'Gradle client connecting to server...')
    );
    const opts: ServerOptions = this.server.getOpts();
    const port = this.server.getPort();

    this.wsClient = new WebSocketClient(`ws://${opts.host}:${port}`);
    this.wsClient.onMessage(this.handleServerMessage);
    this.wsClient.onOpen(() => this._onConnect.fire());
    this.wsClient.onError(this.handleServerError);
    this.wsClient.onLog((data: string) => logger.info(data));
    this.wsClient.open();
  };

  public dispose(): void {
    this.wsClient?.dispose();
    this._onMessage.dispose();
    this._onConnect.dispose();
    this._onActionCancelledMessage.dispose();
    this._onErrorMessage.dispose();
    this._onInfoMessage.dispose();
    this._onOutputMessage.dispose();
    this._onProgressMessage.dispose();
  }

  public async getTasks(
    sourceDir: string
  ): Promise<ServerMessage.GradleTask[] | void> {
    if (this.wsClient) {
      this.statusBarItem.text = localize(
        'client.refreshingTasks',
        '{0} Gradle: Refreshing Tasks',
        '$(sync~spin)'
      );
      this.statusBarItem.show();
      try {
        const getTasks = new ClientMessage.GetTasks();
        getTasks.setSourceDir(sourceDir);

        const message = new ClientMessage.Message();
        message.setGetTasks(getTasks);
        await this.sendMessage(message);
        const serverMessage: ServerMessage.Message = (await this.waitForServerMessage(
          ServerMessage.Message.KindCase.GET_TASKS
        )) as ServerMessage.Message;
        return serverMessage.getGetTasks()?.getTasksList();
      } catch (e) {
        logger.error(
          localize(
            'client.errorRefreshingTasks',
            'Error providing gradle tasks: {0}',
            e.message
          )
        );
        throw e;
      } finally {
        this.statusBarItem.hide();
      }
    }
  }

  public async runTask(
    sourceDir: string,
    task: string,
    args: string[],
    outputListener: (message: ServerMessage.OutputChanged) => void
  ): Promise<void> {
    if (this.wsClient) {
      const outputEvent = this.onOutputMessage(outputListener);
      this.statusBarItem.show();
      try {
        const runTask = new ClientMessage.RunTask();
        runTask.setSourceDir(sourceDir);
        runTask.setTask(task);
        runTask.setArgsList(args);

        const message = new ClientMessage.Message();
        message.setRunTask(runTask);

        await this.sendMessage(message);
        await this.waitForServerMessage(
          ServerMessage.Message.KindCase.RUN_TASK
        );
      } catch (e) {
        logger.error(
          localize(
            'client.errorRunningTask',
            'Error running task: {0}',
            e.message
          )
        );
        throw e;
      } finally {
        this.statusBarItem.hide();
        outputEvent.dispose();
      }
    }
  }

  public async stopTask(sourceDir: string, task: string): Promise<void> {
    if (this.wsClient) {
      try {
        const stopTask = new ClientMessage.StopTask();
        stopTask.setSourceDir(sourceDir);
        stopTask.setTask(task);

        const message = new ClientMessage.Message();
        message.setStopTask(stopTask);
        await this.sendMessage(message);
      } catch (e) {
        logger.error(
          localize(
            'client.errorStoppingTask',
            'Error stopping task: {0}',
            e.message
          )
        );
      } finally {
        this.statusBarItem.hide();
      }
    }
  }

  public async stopGetTasks(sourceDir = ''): Promise<void> {
    if (this.wsClient) {
      try {
        const stopGetTasks = new ClientMessage.StopGetTasks();
        stopGetTasks.setSourceDir(sourceDir);
        const message = new ClientMessage.Message();
        message.setStopGetTasks(stopGetTasks);
        await this.sendMessage(message);
      } finally {
        this.statusBarItem.hide();
      }
    }
  }

  private async sendMessage(message: ClientMessage.Message): Promise<void> {
    try {
      return await new Promise((resolve, reject) => {
        this.wsClient!.send(message.serializeBinary(), (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } catch (e) {
      this.handleConnectionError();
      throw e;
    }
  }

  private handleConnectionError(): void {
    const READY_STATE_CLOSED = 3;
    if (this.wsClient!.getInstance()!.readyState === READY_STATE_CLOSED) {
      this.server.showRestartMessage();
    }
  }

  private waitForServerMessage(
    type: ServerMessage.Message.KindCase
  ): Promise<ServerMessage.Message | Error | unknown> {
    return Promise.race<ServerMessage.Tasks | Error | unknown>([
      new Promise((_, reject) => {
        const event = this.server.onStop(() => {
          reject(
            new Error(
              localize(
                'client.errorWaitingForServerMessage',
                'Error waiting for server message: The server stopped'
              )
            )
          );
          event.dispose();
        });
      }),
      new Promise(resolve => {
        const event = this.onMessage((message: ServerMessage.Message) => {
          if (message.getKindCase() === type) {
            resolve(message);
            event.dispose();
          }
        });
      })
    ]);
  }

  private handleProgressMessage = (message: ServerMessage.Progress): void => {
    const messageStr = message.getMessage().trim();
    if (messageStr) {
      this.statusBarItem.text = `$(sync~spin) Gradle: ${messageStr}`;
    }
  };

  private handleOutputMessage = (
    message: ServerMessage.OutputChanged
  ): void => {
    const logMessage = stripAnsi(message.getMessage()).trim();
    if (logMessage) {
      logger.info(logMessage);
    }
  };

  private handleErrorMessage = (message: ServerMessage.Error): void => {
    const logMessage = message.getMessage().trim();
    if (logMessage) {
      logger.error(logMessage);
    }
  };

  private handleInfoMessage = (message: ServerMessage.Info): void => {
    const logMessage = message.getMessage().trim();
    if (logMessage) {
      logger.info(logMessage);
    }
  };

  private handleServerError = (e: Error): void => {
    logger.error(
      localize(
        'client.errorConnectingToServer',
        'Error connecting to gradle server: {0}',
        e.message
      )
    );
    this.server.showRestartMessage();
  };

  private handleServerMessage = (data: WebSocket.Data): void => {
    if (data instanceof Buffer) {
      let serverMessage: ServerMessage.Message;
      try {
        serverMessage = ServerMessage.Message.deserializeBinary(data);
        if (getIsDebugEnabled()) {
          logger.debug(JSON.stringify(serverMessage.toObject()));
        }
      } catch (e) {
        logger.error(
          localize(
            'client.errorParsingMessageFromServer',
            'Unable to parse message from server: {0}',
            e.message
          )
        );
        return;
      }
      this._onMessage.fire(serverMessage);
      const {
        PROGRESS,
        OUTPUT_CHANGED,
        ERROR,
        ACTION_CANCELLED,
        INFO
      } = ServerMessage.Message.KindCase;
      switch (serverMessage.getKindCase()) {
        case PROGRESS:
          this._onProgressMessage.fire(serverMessage.getProgress());
          break;
        case OUTPUT_CHANGED:
          this._onOutputMessage.fire(serverMessage.getOutputChanged());
          break;
        case ERROR:
          this._onErrorMessage.fire(serverMessage.getError());
          break;
        case ACTION_CANCELLED:
          this._onActionCancelledMessage.fire(
            serverMessage.getActionCancelled()
          );
          break;
        case INFO:
          this._onInfoMessage.fire(serverMessage.getInfo());
          break;
        default:
          break;
      }
    }
  };
}

export function registerClient(
  server: GradleTasksServer,
  statusBarItem: vscode.StatusBarItem,
  context: vscode.ExtensionContext
): GradleTasksClient {
  const client = new GradleTasksClient(server, statusBarItem);
  context.subscriptions.push(client);
  client.onConnect(() => {
    vscode.commands.executeCommand('gradle.refresh', false);
  });
  client.onActionCancelledMessage(
    (message: ServerMessage.ActionCancelled): void => {
      handleCancelledTaskMessage(message);
    }
  );
  return client;
}
