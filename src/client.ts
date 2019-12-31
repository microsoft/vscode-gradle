import WebSocket from 'ws';
import * as vscode from 'vscode';
import stripAnsi from 'strip-ansi';

import { getIsDebugEnabled } from './config';

import { GradleTasksServer, ServerOptions } from './server';

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
  private autoReconnectInterval = 5 * 1000; // ms
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
    this.reconnectTimeout = setTimeout(() => {
      this._onLog.fire('WebSocketClient: reconnecting...');
      this.open();
    }, this.autoReconnectInterval);
  }

  dispose(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.instance?.removeAllListeners();
    this.instance?.close();
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

function getMessage(ws: WebSocket, type: string): Promise<ServerMessage> {
  return new Promise(resolve => {
    function listener(data: WebSocket.Data): void {
      try {
        const message: ServerMessage = JSON.parse(data.toString());
        if (message.type === type) {
          ws.off('message', listener);
          return resolve(message);
        }
      } catch (e) {}
    }
    ws.on('message', listener);
  });
}

export class GradleTasksClient implements vscode.Disposable {
  private outputListeners: Set<(message: ServerMessage) => void> = new Set();
  private cancelledListeners: Set<
    (message: ServerCancelledMessage) => void
  > = new Set();
  private progressListeners: Set<(message: ServerMessage) => void> = new Set();
  private wsClient: WebSocketClient | undefined;

  private _onConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onConnect: vscode.Event<null> = this._onConnect.event;

  private _onAction: vscode.EventEmitter<string> = new vscode.EventEmitter<
    string
  >();
  public readonly onAction: vscode.Event<string> = this._onAction.event;

  constructor(
    private readonly server: GradleTasksServer,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {
    this.addProgressListener(this.handleProgressMessage);
    this.addOutputListener(this.handleOutputMessage);
    this.server.onStart(() => this.connect());
  }

  connect(): void {
    if (this.wsClient) {
      this.wsClient.dispose();
    }

    this.outputChannel.appendLine('Gradle client connecting to server...');
    const opts: ServerOptions = this.server.getOpts();
    const port = this.server.getPort();

    this.wsClient = new WebSocketClient(`ws://${opts.host}:${port}`);
    this.wsClient.onMessage(this.onMessage);
    this.wsClient.onOpen(() => this._onConnect.fire());
    this.wsClient.onError(this.onError);
    this.wsClient.onLog((data: string) => this.outputChannel.appendLine(data));
    this.wsClient.open();
  }

  dispose(): void {
    this.wsClient?.dispose();
  }

  private onError = (e: Error): void => {
    this.outputChannel.appendLine(
      `Error connecting to gradle server: ${e.message}`
    );
    this.server.showRestartMessage();
  };

  private handleConnectionError(): void {
    const READY_STATE_CLOSED = 3;
    if (this.wsClient!.getInstance()!.readyState === READY_STATE_CLOSED) {
      this.server.showRestartMessage();
    }
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
        const serverMessage: GradleTasksServerMessage = (await getMessage(
          this.wsClient.getInstance()!,
          'GRADLE_TASKS'
        )) as GradleTasksServerMessage;
        this._onAction.fire('getTasks');
        return serverMessage.tasks;
      } catch (e) {
        this.outputChannel.appendLine(
          `Error providing gradle tasks: ${e.message}`
        );
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
      this.addOutputListener(outputListener);
      this.statusBarItem.show();
      const clientMessage: RunTaskMessage = {
        type: 'runTask',
        sourceDir,
        task,
        args
      };
      try {
        await this.sendMessage(new Message(clientMessage));
        await getMessage(this.wsClient.getInstance()!, 'GRADLE_RUN_TASK');
        this._onAction.fire('runTask');
      } catch (e) {
        this.outputChannel.appendLine(`Error running task: ${e.message}`);
      } finally {
        this.statusBarItem.hide();
        this.removeOutputListener(outputListener);
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
        this._onAction.fire('stopTask');
      } catch (e) {
        this.outputChannel.appendLine(`Error stopping task: ${e.message}`);
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
        this._onAction.fire('stopGetTasks');
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

  private addProgressListener(
    progressListener: (message: ServerMessage) => void
  ): void {
    this.progressListeners.add(progressListener);
  }

  private addOutputListener(
    outputListener: (message: ServerMessage) => void
  ): void {
    this.outputListeners.add(outputListener);
  }

  public addCancelledListener(
    cancelledListener: (message: ServerCancelledMessage) => void
  ): void {
    this.cancelledListeners.add(cancelledListener);
  }

  private removeOutputListener(
    outputListener: (message: ServerMessage) => void
  ): void {
    this.outputListeners.delete(outputListener);
  }

  private handleProgressMessage = (message: ServerMessage): void => {
    const messageStr = message.message?.trim();
    if (messageStr) {
      this.statusBarItem.text = `$(sync~spin) Gradle: ${messageStr}`;
    }
  };

  private handleOutputMessage = (message: ServerMessage): void => {
    this.outputChannel.appendLine(stripAnsi(message.message!));
  };

  private callListeners(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listeners: Set<(data: any) => void>,
    message: ServerMessage
  ): void {
    Array.from(listeners).forEach(listener => {
      listener(message);
    });
  }

  private onMessage = (data: WebSocket.Data): void => {
    let serverMessage: ServerMessage;
    try {
      serverMessage = JSON.parse(data.toString());
      if (getIsDebugEnabled()) {
        this.outputChannel.appendLine(data.toString());
      }
    } catch (e) {
      this.outputChannel.appendLine(
        `Unable to parse message from server: ${e.message}`
      );
      return;
    }
    switch (serverMessage.type) {
      case 'GRADLE_PROGRESS':
        this.callListeners(this.progressListeners, serverMessage);
        break;
      case 'GRADLE_OUTPUT':
      case 'ERROR':
        this.callListeners(this.outputListeners, serverMessage);
        break;
      case 'ACTION_CANCELLED':
        this.callListeners(this.cancelledListeners, serverMessage);
        break;
      case 'GENERIC_MESSAGE':
        const message = serverMessage.message?.trim();
        if (message) {
          this.outputChannel.appendLine(message);
        }
        break;
      default:
        // Unhandled message type
        break;
    }
  };
}

export function registerClient(
  server: GradleTasksServer,
  outputChannel: vscode.OutputChannel,
  statusBarItem: vscode.StatusBarItem
): GradleTasksClient {
  return new GradleTasksClient(server, outputChannel, statusBarItem);
}
