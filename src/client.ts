import WebSocket from 'ws';
import * as vscode from 'vscode';
import stripAnsi from 'strip-ansi';

import { getIsDebugEnabled } from './config';

import { GradleTasksServer, ServerOptions } from './server';
import { logger } from './logger';
import { handleCancelledTaskMessage } from './tasks';

export type GradleTask = {
  path: string;
  description: string;
  name: string;
  group: string;
  project: string;
  rootProject: string;
  buildFile: string;
};

export interface ServerMessage {
  type: string;
  message?: string;
}

interface GradleTasksServerMessage {
  type: string;
  tasks: GradleTask[];
}

export interface ServerCancelledMessage extends ServerMessage {
  task: string;
  sourceDir: string;
}

export interface ServerOutputMessage extends ServerMessage {
  outputType: 'STDOUT' | 'STDERR';
}

interface ClientMessage {
  type: 'runTask' | 'getTasks' | 'stopTask' | 'stopGetTasks';
}

interface GetTasksMessage extends ClientMessage {
  sourceDir: string;
}

interface RunTaskMessage extends ClientMessage {
  sourceDir: string;
  task: string;
  args: string[];
}

interface StopTaskMessage extends ClientMessage {
  sourceDir: string;
  task: string;
}

interface StopGetTasksMessage extends ClientMessage {
  sourceDir: string;
}

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
      if (err.code === 'ECONNREFUSED') {
        this.reconnect();
      } else {
        this._onError.fire(err);
      }
    });
  }

  send(data: string, callback: (err?: Error) => void): void {
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

class Message {
  constructor(private readonly message: ClientMessage) {}
  toString(): string {
    return JSON.stringify(this.message);
  }
}

export class GradleTasksClient implements vscode.Disposable {
  private wsClient: WebSocketClient | undefined;

  private _onConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onConnect: vscode.Event<null> = this._onConnect.event;

  private _onGradleProgress: vscode.EventEmitter<
    ServerMessage
  > = new vscode.EventEmitter<ServerMessage>();
  public readonly onGradleProgress: vscode.Event<ServerMessage> = this
    ._onGradleProgress.event;

  private _onGradleOutput: vscode.EventEmitter<
    ServerOutputMessage
  > = new vscode.EventEmitter<ServerOutputMessage>();
  public readonly onGradleOutput: vscode.Event<ServerOutputMessage> = this
    ._onGradleOutput.event;

  private _onGradleError: vscode.EventEmitter<
    ServerMessage
  > = new vscode.EventEmitter<ServerMessage>();
  public readonly onGradleError: vscode.Event<ServerMessage> = this
    ._onGradleError.event;

  private _onActionCancelled: vscode.EventEmitter<
    ServerCancelledMessage
  > = new vscode.EventEmitter<ServerCancelledMessage>();
  public readonly onActionCancelled: vscode.Event<ServerCancelledMessage> = this
    ._onActionCancelled.event;

  private _onMessage: vscode.EventEmitter<
    ServerMessage
  > = new vscode.EventEmitter<ServerMessage>();
  public readonly onMessage: vscode.Event<ServerMessage> = this._onMessage
    .event;

  public constructor(
    private readonly server: GradleTasksServer,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {
    this.onGradleProgress(this.handleProgressMessage);
    this.onGradleOutput(this.handleOutputMessage);
    this.server.onStart(this.connect);
    this.server.onStop(this.handleServerStopped);
  }

  private handleServerStopped = (): void => {
    this.statusBarItem.hide();
  };

  public connect = (): void => {
    if (this.wsClient) {
      this.wsClient.dispose();
    }

    logger.info('Gradle client connecting to server...');
    const opts: ServerOptions = this.server.getOpts();
    const port = this.server.getPort();

    this.wsClient = new WebSocketClient(`ws://${opts.host}:${port}`);
    this.wsClient.onMessage(this.handleMessage);
    this.wsClient.onOpen(() => this._onConnect.fire());
    this.wsClient.onError(this.handleError);
    this.wsClient.onLog((data: string) => logger.info(data));
    this.wsClient.open();
  };

  public dispose(): void {
    this.wsClient?.dispose();
    this._onMessage.dispose();
    this._onConnect.dispose();
    this._onActionCancelled.dispose();
    this._onGradleError.dispose();
    this._onGradleOutput.dispose();
    this._onGradleProgress.dispose();
  }

  public async getTasks(sourceDir: string): Promise<GradleTask[] | undefined> {
    if (this.wsClient) {
      this.statusBarItem.text = '$(sync~spin) Gradle: Refreshing Tasks';
      this.statusBarItem.show();
      try {
        const clientMessage: GetTasksMessage = {
          type: 'getTasks',
          sourceDir
        };
        await this.sendMessage(new Message(clientMessage));
        const serverMessage: GradleTasksServerMessage = (await this.waitForServerMessage(
          'GRADLE_TASKS'
        )) as GradleTasksServerMessage;
        return serverMessage.tasks;
      } catch (e) {
        logger.error(`Error providing gradle tasks: ${e.message}`);
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
    outputListener: (message: ServerMessage) => void
  ): Promise<void> {
    if (this.wsClient) {
      const outputEvent = this.onGradleOutput(outputListener);
      this.statusBarItem.show();
      const clientMessage: RunTaskMessage = {
        type: 'runTask',
        sourceDir,
        task,
        args
      };
      try {
        await this.sendMessage(new Message(clientMessage));
        await this.waitForServerMessage('GRADLE_RUN_TASK');
      } catch (e) {
        logger.error(`Error running task: ${e.message}`);
        throw e;
      } finally {
        this.statusBarItem.hide();
        outputEvent.dispose();
      }
    }
  }

  public async stopTask(sourceDir: string, task: string): Promise<void> {
    if (this.wsClient) {
      const clientMessage: StopTaskMessage = {
        type: 'stopTask',
        sourceDir,
        task
      };
      try {
        await this.sendMessage(new Message(clientMessage));
      } catch (e) {
        logger.error(`Error stopping task: ${e.message}`);
      } finally {
        this.statusBarItem.hide();
      }
    }
  }

  public async stopGetTasks(sourceDir = ''): Promise<void> {
    if (this.wsClient) {
      const clientMessage: StopGetTasksMessage = {
        type: 'stopGetTasks',
        sourceDir
      };
      try {
        await this.sendMessage(new Message(clientMessage));
      } finally {
        this.statusBarItem.hide();
      }
    }
  }

  private async sendMessage(message: Message): Promise<void> {
    try {
      return await new Promise((resolve, reject) => {
        this.wsClient!.send(message.toString(), (err?: Error) => {
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

  private handleError = (e: Error): void => {
    logger.error(`Error connecting to gradle server: ${e.message}`);
    this.server.showRestartMessage();
  };

  private handleConnectionError(): void {
    const READY_STATE_CLOSED = 3;
    if (this.wsClient!.getInstance()!.readyState === READY_STATE_CLOSED) {
      this.server.showRestartMessage();
    }
  }

  private waitForServerMessage(
    type: string
  ): Promise<ServerMessage | Error | unknown> {
    return Promise.race<ServerMessage | Error | unknown>([
      new Promise((_, reject) => {
        const event = this.server.onStop(() => {
          reject(
            new Error('Error waiting for server message: The server stopped')
          );
          event.dispose();
        });
      }),
      new Promise(resolve => {
        const event = this.onMessage((message: ServerMessage) => {
          if (message.type === type) {
            resolve(message);
            event.dispose();
          }
        });
      })
    ]);
  }

  private handleProgressMessage = (message: ServerMessage): void => {
    const messageStr = message.message?.trim();
    if (messageStr) {
      this.statusBarItem.text = `$(sync~spin) Gradle: ${messageStr}`;
    }
  };

  private handleOutputMessage = (message: ServerOutputMessage): void => {
    logger.info(stripAnsi(message.message!));
  };

  private handleMessage = (data: WebSocket.Data): void => {
    let serverMessage: ServerMessage;
    try {
      serverMessage = JSON.parse(data.toString());
      if (getIsDebugEnabled()) {
        logger.info(data.toString());
      }
    } catch (e) {
      logger.error(`Unable to parse message from server: ${e.message}`);
      return;
    }
    this._onMessage.fire(serverMessage);
    switch (serverMessage.type) {
      case 'GRADLE_PROGRESS':
        this._onGradleProgress.fire(serverMessage);
        break;
      case 'GRADLE_OUTPUT':
        this._onGradleOutput.fire(serverMessage as ServerOutputMessage);
        break;
      case 'ERROR':
        this._onGradleError.fire(serverMessage);
        break;
      case 'ACTION_CANCELLED':
        this._onActionCancelled.fire(serverMessage as ServerCancelledMessage);
        break;
      case 'GENERIC_MESSAGE':
        const message = serverMessage.message?.trim();
        if (message) {
          logger.info(message);
        }
        break;
      default:
        break;
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
  client.onActionCancelled((message: ServerCancelledMessage): void => {
    handleCancelledTaskMessage(message);
  });
  return client;
}
