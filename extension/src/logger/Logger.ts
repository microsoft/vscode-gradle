import * as vscode from 'vscode';
import { isTest } from '../util';
import { getConfigIsDebugEnabled } from '../config';

export type logType = 'info' | 'warning' | 'error' | 'debug';

export class Logger {
  private channel?: vscode.OutputChannel;

  public log(message: string, type: logType): void {
    if (!this.channel) {
      throw new Error('No extension output channel defined.');
    }
    this.appendLine(this.format(message, type));
  }

  public appendLine(message: string): void {
    this.channel?.appendLine(message);
    if (isTest()) {
      console.log(message);
    }
  }

  public append(message: string): void {
    this.channel?.append(message);
    if (isTest()) {
      console.log(message);
    }
  }

  public format(message: string, type: logType): string {
    return `[${type}] ${message}`;
  }

  public info(...messages: string[]): void {
    this.log(messages.join(' '), 'info');
  }

  public warning(...messages: string[]): void {
    this.log(messages.join(' '), 'warning');
  }

  public error(...messages: string[]): void {
    this.log(messages.join(' '), 'error');
  }

  public debug(...messages: string[]): void {
    if (getConfigIsDebugEnabled() || isTest()) {
      this.log(messages.join(' '), 'debug');
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

  public reset(): void {
    this.channel = undefined;
  }
}
