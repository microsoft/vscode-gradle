import * as vscode from 'vscode';

type callback = () => void;

export class EventWaiter {
  private eventRun = false;

  constructor(private readonly event: vscode.Event<null>) {
    this.onEvent(() => {
      this.eventRun = true;
    });
  }

  public onEvent = (callback: callback): void => {
    const disposable = this.event(() => {
      disposable.dispose();
      this.eventRun = true;
      callback();
    });
  };

  public wait = (): Promise<void> => {
    if (this.eventRun) {
      return Promise.resolve();
    }
    return new Promise(this.onEvent);
  };

  public reset(): void {
    this.eventRun = false;
  }
}
