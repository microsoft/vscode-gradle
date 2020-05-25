import * as vscode from 'vscode';

export class ProgressHandler {
  private _onProgressStart: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onProgressStart: vscode.Event<null> = this._onProgressStart
    .event;

  public constructor(
    private readonly progress: vscode.Progress<{ message?: string }>,
    private readonly initialMessage?: string
  ) {
    if (this.initialMessage) {
      this.progress.report({ message: this.initialMessage });
    }
  }

  public report(message: string): void {
    if (message.trim()) {
      this.progress.report({ message });
      this._onProgressStart.fire(null);
      this._onProgressStart.dispose();
    }
  }
}
