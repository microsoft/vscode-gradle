import WebSocket from 'ws';
import * as vscode from 'vscode';
import * as cp from 'child_process';

export type GradleTask = {
  path: string;
  description: string;
  name: string;
  group: string;
  project: string;
  rootProject: string;
  buildFile: string;
};

interface ServerOptions {
  host: string;
  port: number;
}

interface ClientMessage {
  type: 'runTask' | 'getTasks';
}

interface GetTasksMessage extends ClientMessage {
  sourceDir: string;
}

interface RunTaskMessage extends ClientMessage {
  sourceDir: string;
  task: string;
  args: string[];
}

interface ServerMessage {
  type: string;
  message?: string;
}

interface GradleTasksServerMessage {
  type: string;
  tasks: GradleTask[];
}

class Message {
  constructor(private readonly message: ClientMessage) {}
  toString(): string {
    return JSON.stringify(this.message);
  }
}

function getMessage(
  ws: WebSocket,
  type: string,
  progressType?: string
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    function listener(data: WebSocket.Data): void {
      try {
        const message: ServerMessage = JSON.parse(data.toString());
        if (message.type === type) {
          ws.off('message', listener);
          return resolve(message);
        } else if (
          progressType &&
          message.type === progressType &&
          message.message === 'STOP'
        ) {
          ws.off('message', listener);
          return reject();
        }
      } catch (e) {}
    }
    ws.on('message', listener);
  });
}

export class GradleTasksClient {
  private connectTries = 0;
  private maxConnectTries = 10;
  private retryDelay = 400;
  private connection: WebSocket | undefined = undefined;

  constructor(
    private readonly server: GradleTasksServer,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const opts: ServerOptions = this.server.getOpts();
      const ws = new WebSocket(`ws://${opts.host}:${opts.port}`);

      ws.on('message', this.onServerMessage);

      ws.on('open', () => {
        this.connection = ws;
        resolve();
      });

      ws.on('error', async err => {
        if (this.connectTries < this.maxConnectTries) {
          setTimeout(async () => {
            this.connectTries += 1;
            resolve(await this.connect());
          }, this.retryDelay);
        } else {
          reject(err);
        }
      });
    });
  }

  private onServerMessage = (data: WebSocket.Data): void => {
    try {
      const message: ServerMessage = JSON.parse(data.toString());
      if (message.type === 'GRADLE_PROGRESS' && message.message?.trim()) {
        this.statusBarItem.text = `$(sync~spin) Gradle: ${message.message}`;
        this.outputChannel.appendLine(`Gradle: ${message.message}`);
      } else if (message.type === 'GRADLE_OUTPUT') {
        this.outputChannel.appendLine(message.message!);
      }
    } catch (e) {
      this.outputChannel.appendLine(data.toString());
    }
  };

  public async getTasks(sourceDir: string): Promise<GradleTask[] | undefined> {
    if (this.connection) {
      this.statusBarItem.text = '$(sync~spin) Gradle: Refreshing Tasks';
      this.statusBarItem.show();
      const clientMessage: GetTasksMessage = { type: 'getTasks', sourceDir };
      this.connection.send(new Message(clientMessage).toString());
      try {
        const serverMessage: GradleTasksServerMessage = (await getMessage(
          this.connection,
          'GRADLE_TASKS',
          'GRADLE_TASKS_PROGRESS'
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
    args: string[]
  ): Promise<void> {
    if (this.connection) {
      const clientMessage: RunTaskMessage = {
        type: 'runTask',
        sourceDir,
        task,
        args
      };
      this.connection.send(new Message(clientMessage).toString());
      try {
        const message = await getMessage(this.connection, 'GRADLE_RUN_TASK');
        console.log('message', message);
      } finally {
        this.statusBarItem.hide();
      }
    }
  }
}

export class GradleTasksServer implements vscode.Disposable {
  private process: cp.ChildProcessWithoutNullStreams | undefined;
  constructor(
    private readonly opts: ServerOptions,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly context: vscode.ExtensionContext
  ) {}

  public start(): Promise<cp.ChildProcessWithoutNullStreams> {
    const cwd = this.context.asAbsolutePath('lib');
    const cmd = getGradleTasksServerCommand();
    return new Promise((resolve, reject) => {
      this.process = startProcess(
        cmd,
        [this.opts.port.toString()],
        { cwd },
        (output: string) => {
          this.outputChannel.append(output);
        },
        (err: Error) => {
          this.outputChannel.appendLine(
            'Error starting the server: ' + err.toString()
          );
          reject(err);
        }
      );
      resolve(this.process);
    });
  }

  public dispose(): void {
    if (this.process) {
      this.process.kill();
    }
  }

  public getOpts(): ServerOptions {
    return this.opts;
  }
}

export function getGradleTasksServerCommand(): string {
  const platform = process.platform;
  if (platform === 'win32') {
    return '.\\gradle-tasks.bat';
  } else if (platform === 'linux' || platform === 'darwin') {
    return './gradle-tasks';
  } else {
    throw new Error('Unsupported platform');
  }
}

function startProcess(
  cmd: string,
  args: ReadonlyArray<string> = [],
  options: cp.SpawnOptionsWithoutStdio = {},
  onOutput: (output: string) => void,
  onError: (err: Error) => void
): cp.ChildProcessWithoutNullStreams {
  const process = cp.spawn(cmd, args, options);
  process.stdout.on('data', (buffer: Buffer) => {
    onOutput(buffer.toString());
  });
  process.stderr.on('data', (buffer: Buffer) => {
    onOutput(buffer.toString());
  });
  process.on('error', onError);
  process.on('exit', (code: number) => {
    onError(new Error(`Process exited with code ${code}`));
  });
  return process;
}

export async function registerServer(
  opts: ServerOptions,
  outputChannel: vscode.OutputChannel,
  context: vscode.ExtensionContext
): Promise<GradleTasksServer> {
  const server = new GradleTasksServer(opts, outputChannel, context);
  await server.start();
  return server;
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
