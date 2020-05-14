import * as util from 'util';
import * as vscode from 'vscode';
import { Output } from './proto/gradle_tasks_pb';

export type OutputType =
  | typeof Output.OutputType.STDERR
  | typeof Output.OutputType.STDOUT;

export class OutputBuffer implements vscode.Disposable {
  private _onFlush: vscode.EventEmitter<string> = new vscode.EventEmitter<
    string
  >();
  public readonly onFlush: vscode.Event<string> = this._onFlush.event;
  private buffer = '';

  constructor(private readonly outputType: OutputType) {}

  public getOutputType(): OutputType {
    return this.outputType;
  }

  public write(messageBytes: Uint8Array): void {
    new util.TextDecoder('utf-8')
      .decode(messageBytes)
      .split('')
      .forEach((char: string) => {
        this.buffer += char;
        if (char === '\n' || char === '\r\n') {
          this.flush();
        }
      });
  }

  private flush(): void {
    this._onFlush.fire(this.buffer);
    this.buffer = '';
  }

  public dispose(): void {
    if (this.buffer.length) {
      this.flush();
    }
    this._onFlush.dispose();
  }
}
