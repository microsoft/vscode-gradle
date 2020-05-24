import * as vscode from 'vscode';

export class EventWaiter implements vscode.Disposable {
  private eventRun = false;
  private eventDisposable?: vscode.Disposable;

  constructor(private readonly event: vscode.Event<null>) {
    this.eventDisposable = this.event(() => {
      this.eventRun = true;
    });
  }

  wait = (): Promise<void> => {
    if (this.eventRun) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const disposable = this.event(() => {
        disposable.dispose();
        resolve();
      });
    });
  };

  public dispose(): void {
    this.eventDisposable?.dispose();
  }
}
