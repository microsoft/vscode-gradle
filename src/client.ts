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
  private progressListeners: Set<(message: ServerMessage) => void> = new Set();

  constructor(
    private readonly server: GradleTasksServer,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {
    this.addProgressListener(this.handleProgress);
    this.addOutputListener(this.handleOutput);
  }

  connect(retries = 5, retryDelay = 400): Promise<void> {
    return new Promise((resolve, reject) => {
      const opts: ServerOptions = this.server.getOpts();
      const ws = new WebSocket(`ws://${opts.host}:${opts.port}`);

      ws.on('message', this.onMessage);

      ws.on('open', () => {
        this.connection = ws;
        resolve();
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

  public async getTasks(sourceDir: string): Promise<GradleTask[] | undefined> {
    if (this.connection) {
      this.statusBarItem.text = '$(sync~spin) Gradle: Refreshing Tasks';
      this.statusBarItem.show();
      const clientMessage: GetTasksMessage = { type: 'getTasks', sourceDir };
      this.connection.send(new Message(clientMessage).toString());
      try {
        const serverMessage: GradleTasksServerMessage = (await getMessage(
          this.connection,
          'GRADLE_TASKS'
        )) as GradleTasksServerMessage;
        return serverMessage.tasks;
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
    if (this.connection) {
      this.addOutputListener(outputListener);
      this.statusBarItem.show();
      const clientMessage: RunTaskMessage = {
        type: 'runTask',
        sourceDir,
        task,
        args
      };
      this.connection.send(new Message(clientMessage).toString());
      try {
        await getMessage(this.connection, 'GRADLE_RUN_TASK');
      } finally {
        this.statusBarItem.hide();
        this.removeOutputListener(outputListener);
      }
    }
  }

  public stopTask(sourceDir: string, task: string): void {
    if (this.connection) {
      const clientMessage: StopTaskMessage = {
        type: 'stopTask',
        sourceDir,
        task
      };
      this.connection.send(new Message(clientMessage).toString());
    }
  }

  public stopGetTasks(sourceDir = ''): void {
    if (this.connection) {
      const clientMessage: StopGetTasksMessage = {
        type: 'stopGetTasks',
        sourceDir
      };
      this.connection.send(new Message(clientMessage).toString());
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

  private removeOutputListener(
    outputListener: (message: ServerMessage) => void
  ): void {
    this.outputListeners.delete(outputListener);
  }

  private handleProgress = (message: ServerMessage): void => {
    const messageStr = message.message?.trim();
    if (messageStr) {
      this.statusBarItem.text = `$(sync~spin) Gradle: ${messageStr}`;
    }
  };

  private handleOutput = (message: ServerMessage): void => {
    this.outputChannel.appendLine(stripAnsi(message.message!));
  };

  private callListeners(
    listeners: Set<(data: ServerMessage) => void>,
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

export async function registerClient(
  server: GradleTasksServer,
  outputChannel: vscode.OutputChannel,
  statusBarItem: vscode.StatusBarItem
): Promise<GradleTasksClient> {
  const gradleTasksClient = new GradleTasksClient(
    server,
    outputChannel,
    statusBarItem
  );
  await gradleTasksClient.connect();
  return gradleTasksClient;
}
