import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import getPort from 'get-port';
import { getGradleServerCommand, getGradleServerEnv } from './serverUtil';
import { isDebuggingServer } from '../util';
import { Logger } from '../logger/index';

const serverLogLevelRegEx = /^\[([A-Z]+)\](.*)$/;

export interface ServerOptions {
  host: string;
}

export class GradleServer implements vscode.Disposable {
  private readonly _onDidStart: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private readonly _onDidStop: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private ready = false;
  private port: number | undefined;

  public readonly onDidStart: vscode.Event<null> = this._onDidStart.event;
  public readonly onDidStop: vscode.Event<null> = this._onDidStop.event;
  private process?: cp.ChildProcessWithoutNullStreams;

  constructor(
    private readonly opts: ServerOptions,
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger
  ) {}

  public async start(): Promise<void> {
    if (isDebuggingServer()) {
      this.port = 8887;
      this.fireOnStart();
    } else {
      this.port = await getPort();
      const cwd = this.context.asAbsolutePath('lib');
      const cmd = path.join(cwd, getGradleServerCommand());
      const args = [String(this.port)];
      const env = getGradleServerEnv();

      this.logger.debug(`Gradle Server cmd: ${cmd} ${args.join(' ')}`);
      this.logger.debug('Starting server');

      this.process = cp.spawn(cmd, args, { cwd, env, shell: true });
      this.process.stdout.on('data', this.logOutput);
      this.process.stderr.on('data', this.logOutput);
      this.process
        .on('error', async (err: Error) =>
          this.logger.error('Server error:', err.message)
        )
        .on('exit', async (code) => {
          if (code !== 0) {
            await this.handleServerStartError();
          }
        });

      this.fireOnStart();
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
      await this.start();
    }
  }

  public async restart(): Promise<void> {
    this.logger.info('Restarting gradle server');
    this.killProcess();
    await this.start();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private logOutput = (data: any): void => {
    const str = data.toString().trim();
    if (!str) {
      return;
    }
    const logLevelMatches = str.match(serverLogLevelRegEx);
    if (logLevelMatches.length) {
      const [, serverLogLevel, serverLogMessage] = logLevelMatches;
      const logLevel = serverLogLevel.toLowerCase() as
        | 'debug'
        | 'info'
        | 'warn'
        | 'error';
      this.logger[logLevel](serverLogMessage.trim());
    } else {
      this.logger.info(str);
    }
  };

  private killProcess(): void {
    this.process?.removeAllListeners();
    this.process?.kill('SIGTERM');
  }

  private async handleServerStartError(): Promise<void> {
    this.logger.error('There was an error starting the server');
    this.ready = false;
    this._onDidStop.fire(null);
    this.logger.info('Gradle server stopped');
    await this.showRestartMessage();
  }

  private fireOnStart(): void {
    this.logger.info('Gradle server started');
    this.ready = true;
    this._onDidStart.fire(null);
  }

  public dispose(): void {
    this.killProcess();
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
