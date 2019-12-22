import * as vscode from 'vscode';
import * as cp from 'child_process';

export interface ServerOptions {
  host: string;
  port: number;
}

export class GradleTasksServer implements vscode.Disposable {
  private process: cp.ChildProcessWithoutNullStreams | undefined;
  constructor(
    private readonly opts: ServerOptions,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly context: vscode.ExtensionContext
  ) {}

  public start(): void {
    const cwd = this.context.asAbsolutePath('lib');
    const cmd = getGradleTasksServerCommand();
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
      }
    );
  }

  public dispose(): void {
    this.process?.kill();
  }

  public getOpts(): ServerOptions {
    return this.opts;
  }
}

function getGradleTasksServerCommand(): string {
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
  server.start();
  return server;
}
