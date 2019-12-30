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
  private connectTries = 0;
  private connection: WebSocket | undefined = undefined;
  private outputListeners: Set<(message: ServerMessage) => void> = new Set();
  private cancelledListeners: Set<
    (message: ServerCancelledMessage) => void
  > = new Set();
  private progressListeners: Set<(message: ServerMessage) => void> = new Set();

  private _onConnect: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onConnect: vscode.Event<null> = this._onConnect.event;

  constructor(
    private readonly server: GradleTasksServer,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {
    this.addProgressListener(this.handleProgressMessage);
    this.addOutputListener(this.handleOutputMessage);
    server.onStart(this.onServerStart);
  }

  public onServerStart = async (): Promise<void> => {
    try {
      await this.connect();
    } catch (e) {
      this.outputChannel.appendLine(
        `Unable to connect to tasks server: ${e.message}`
      );
    }
  };

  connect(retries = 5, retryDelay = 400): Promise<void> {
    return new Promise((resolve, reject) => {
      const opts: ServerOptions = this.server.getOpts();
      const port = this.server.getPort();
      const ws = new WebSocket(`ws://${opts.host}:${port}`);

      ws.on('message', this.onMessage);

      ws.on('open', () => {
        this.connection = ws;
        this._onConnect.fire();
        resolve();
      });

      ws.on('close', () => {
        this.connection = undefined;
      });

      ws.on('error', async err => {
        if (this.connectTries < retries) {
          setTimeout(async () => {
            this.connectTries += 1;
            try {
              resolve(await this.connect());
            } catch (e) {
              reject(e);
            }
          }, retryDelay);
        } else {
          reject(err);
        }
      });
    });
  }

  dispose(): void {
    this.connection?.close();
  }

  private async handleConnectionError(): Promise<void> {
    this.outputChannel.appendLine('No connection to gradle server');
    this.server.showRestartMessage();
  }

  public async getTasks(sourceDir: string): Promise<GradleTask[] | undefined> {
    if (this.connection) {
      this.statusBarItem.text = '$(sync~spin) Gradle: Refreshing Tasks';
      this.statusBarItem.show();
      try {
        const clientMessage: GetTasksMessage = {
          type: 'getTasks',
          sourceDir
        };
        await this.sendMessage(new Message(clientMessage));
        const serverMessage: GradleTasksServerMessage = (await getMessage(
          this.connection,
          'GRADLE_TASKS'
        )) as GradleTasksServerMessage;
        return serverMessage.tasks;
      } finally {
        this.statusBarItem.hide();
      }
    } else {
      this.handleConnectionError();
    }
  }

  public async runTask(
    sourceDir: string,
    task: string,
    args: string[],
    outputListener: (message: ServerMessage) => void
  ): Promise<void> {
    if (this.connection) {
      this.addOutputListener(outputListener);
      this.statusBarItem.show();
      const clientMessage: RunTaskMessage = {
        type: 'runTask',
        sourceDir,
        task,
        args
      };
      await this.sendMessage(new Message(clientMessage));
      try {
        await getMessage(this.connection, 'GRADLE_RUN_TASK');
      } finally {
        this.statusBarItem.hide();
        this.removeOutputListener(outputListener);
      }
    } else {
      this.handleConnectionError();
    }
  }

  public async stopTask(sourceDir: string, task: string): Promise<void> {
    if (this.connection) {
      const clientMessage: StopTaskMessage = {
        type: 'stopTask',
        sourceDir,
        task
      };
      await this.sendMessage(new Message(clientMessage));
    } else {
      this.handleConnectionError();
    }
  }

  public async stopGetTasks(sourceDir = ''): Promise<void> {
    if (this.connection) {
      const clientMessage: StopGetTasksMessage = {
        type: 'stopGetTasks',
        sourceDir
      };
      await this.sendMessage(new Message(clientMessage));
    } else {
      this.handleConnectionError();
    }
  }

  private sendMessage(message: Message): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.send(message.toString(), (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        this.handleConnectionError();
        resolve();
      }
    });
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
