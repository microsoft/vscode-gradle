import * as vscode from 'vscode';
import { Output } from './proto/gradle_tasks_pb';

export type OutputType =
  | typeof Output.OutputType.STDERR
  | typeof Output.OutputType.STDOUT;

export class OutputBuffer implements vscode.Disposable {
  private _onOutputLine: vscode.EventEmitter<string> = new vscode.EventEmitter<
    string
  >();
  public readonly onOutputLine: vscode.Event<string> = this._onOutputLine.event;
  private buffer = '';

  constructor(private readonly outputType: OutputType) {}

  public getOutputType(): OutputType {
    return this.outputType;
  }

  public write(byte: number): void {
    const char = String.fromCharCode(byte);
    this.buffer += char;
    if (char === '\n' || char === '\r\n') {
      this.flush();
    }
  }

  public dispose(): void {
    if (this.buffer.length) {
      this.flush();
    }
    this._onOutputLine.dispose();
  }

  private flush(): void {
    this._onOutputLine.fire(this.buffer);
    this.buffer = '';
  }
}
