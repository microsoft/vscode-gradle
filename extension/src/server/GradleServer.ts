import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import getPort from 'get-port';
import kill from 'tree-kill';
import { getGradleServerCommand, getGradleServerEnv } from './serverUtil';
import { isDebuggingServer } from '../util';
import { Logger } from '../logger/index';

const SERVER_LOGLEVEL_REGEX = /^\[([A-Z]+)\](.*)$/;
const DOWNLOAD_PROGRESS_CHAR = '.';

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
  private restarting = false;

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
      const env = getGradleServerEnv();
      const args = [String(this.port)];

      this.logger.debug('Starting server');
      this.logger.debug(`Gradle Server cmd: ${cmd} ${args.join(' ')}`);

      this.process = cp.spawn(`"${cmd}"`, args, {
        cwd,
        env,
        shell: true,
      });
      this.process.stdout.on('data', this.logOutput);
      this.process.stderr.on('data', this.logOutput);
      this.process
        .on('error', (err: Error) => this.logger.error(err.message))
        .on('exit', async (code) => {
          this.logger.warn('Gradle server stopped');
          this._onDidStop.fire(null);
          this.ready = false;
          this.process?.removeAllListeners();
          if (this.restarting) {
            this.restarting = false;
            await this.start();
          } else if (code !== 0) {
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
    this.restarting = true;
    this.killProcess();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private logOutput = (data: any): void => {
    const str = data.toString().trim();
    if (!str || str === DOWNLOAD_PROGRESS_CHAR) {
      return;
    }
    const logLevelMatches = str.match(SERVER_LOGLEVEL_REGEX);
    if (logLevelMatches && logLevelMatches.length) {
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
    if (this.process) {
      kill(this.process.pid, 'SIGTERM');
    }
  }

  private async handleServerStartError(): Promise<void> {
    await this.showRestartMessage();
  }

  private fireOnStart(): void {
    this.ready = true;
    this._onDidStart.fire(null);
  }

  public stop(): void {
    this.process?.removeAllListeners();
    this.killProcess();
    this.ready = false;
  }

  public dispose(): void {
    this.stop();
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
