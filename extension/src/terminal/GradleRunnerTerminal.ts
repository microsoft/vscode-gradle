import * as vscode from 'vscode';
import * as util from 'util';
import { isTest } from '../util';
import { logger, LoggerStream, LogVerbosity } from '../logger';
import { Output } from '../proto/gradle_pb';
import { ServiceError } from '@grpc/grpc-js';
import { RootProject } from '../rootProject/RootProject';

const NL = '\n';
const CR = '\r';
const nlRegExp = new RegExp(`${NL}([^${CR}])`, 'g');

export abstract class GradleRunnerTerminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  protected stdOutLoggerStream: LoggerStream;
  protected readonly closeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  public readonly onDidClose?: vscode.Event<void> = this.closeEmitter.event;

  constructor(protected readonly rootProject: RootProject) {
    // TODO: this is only needed for the tests. Find a better way to test task output in the tests.
    this.stdOutLoggerStream = new LoggerStream(logger, LogVerbosity.INFO);
  }

  public open(): void {
    this.runCommand();
  }

  protected handleOutput = (output: Output): void => {
    const messageBytes = output.getOutputBytes_asU8();
    if (messageBytes.length) {
      if (isTest()) {
        this.stdOutLoggerStream.write(messageBytes);
      }
      this.write(new util.TextDecoder('utf-8').decode(messageBytes));
    }
  };

  protected handleError(err: ServiceError): void {
    this.write(err.details || err.message);
  }

  public handleInput(data: string): void {
    // sigint eg cmd/ctrl+C
    if (data === '\x03') {
      this.cancelCommand();
    }
  }

  private write(message: string): void {
    // Note writing `\n` will just move the cursor down 1 row.
    // We need to write `\r` as well to move the cursor to the left-most cell.
    const sanitisedMessage = message.replace(nlRegExp, `${NL + CR}$1`);
    this.writeEmitter.fire(sanitisedMessage);
  }

  protected abstract runCommand(): void;

  protected abstract cancelCommand(): void;
}
