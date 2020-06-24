import * as vscode from 'vscode';

export enum LogVerbosity {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private channel?: vscode.OutputChannel;
  private verbosity: LogVerbosity = LogVerbosity.INFO;

  constructor(private readonly prefix?: string) {}

  public setLogVerbosity(verbosity: LogVerbosity): void {
    this.verbosity = verbosity;
  }

  public log(message: string, verbosity: LogVerbosity): void {
    if (!this.channel) {
      throw new Error('No extension output channel defined.');
    }
    this.appendLine(this.format(message, verbosity), verbosity);
  }

  public appendLine(message: string, verbosity: LogVerbosity): void {
    if (verbosity >= this.verbosity) {
      this.channel?.appendLine(message);
    }
  }

  public append(message: string, verbosity: LogVerbosity): void {
    if (verbosity >= this.verbosity) {
      this.channel?.append(message);
    }
  }

  public format(message: string, verbosity: LogVerbosity): string {
    const verbosityString = LogVerbosity[verbosity].toLowerCase();
    const prefix = this.prefix ? ` [${this.prefix}]` : '';
    return `[${verbosityString}]${prefix} ${message}`;
  }

  public info(...messages: string[]): void {
    this.log(messages.join(' '), LogVerbosity.INFO);
  }

  public warn(...messages: string[]): void {
    this.log(messages.join(' '), LogVerbosity.WARN);
  }

  public error(...messages: string[]): void {
    this.log(messages.join(' '), LogVerbosity.ERROR);
  }

  public debug(...messages: string[]): void {
    this.log(messages.join(' '), LogVerbosity.DEBUG);
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
