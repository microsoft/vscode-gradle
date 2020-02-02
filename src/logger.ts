import * as vscode from 'vscode';

type logType = 'info' | 'warning' | 'error' | 'debug';

export class Logger {
  private channel: vscode.OutputChannel | undefined;

  private log(message: string, type: logType): void {
    if (!this.channel) {
      throw new Error('No extension output channel defined.');
    }
    this.channel.appendLine(`[${type}] ${message}`);
  }

  public info(message: string): void {
    this.log(message, 'info');
  }

  public warning(message: string): void {
    this.log(message, 'warning');
  }

  public error(message: string): void {
    this.log(message, 'error');
  }

  public debug(message: string): void {
    this.log(message, 'debug');
  }

  public getChannel(): vscode.OutputChannel | undefined {
    return this.channel;
  }

  public setLoggingChannel(channel: vscode.OutputChannel): void {
    if (this.channel) {
      throw new Error('Output channel already defined.');
    }
    this.channel = channel;
  }
}

export const logger = new Logger();
