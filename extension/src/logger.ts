import * as vscode from 'vscode';
import { getIsDebugEnabled } from './config';
import { isTest } from './util';

type logType = 'info' | 'warning' | 'error' | 'debug' | 'task-stdout';

export class Logger {
  private channel: vscode.OutputChannel | undefined;

  public log(message: string, type: logType): void {
    if (!this.channel) {
      throw new Error('No extension output channel defined.');
    }
    const logMessage = this.format(message, type);
    this.channel.appendLine(logMessage);
    if (isTest()) {
      console.log(logMessage);
    } else {
      console.log('no test');
    }
  }

  public format(message: string, type: logType): string {
    return `[${type}] ${message}`;
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
    if (getIsDebugEnabled()) {
      this.log(message, 'debug');
    }
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
