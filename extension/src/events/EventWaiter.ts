import * as vscode from 'vscode';

type callback = () => void;

export class EventWaiter {
  private eventRun = false;

  constructor(private readonly event: vscode.Event<null>) {
    this.waitForEvent();
  }

  public waitForEvent = (callback?: callback): void => {
    const disposable = this.event(() => {
      disposable.dispose();
      this.eventRun = true;
      if (callback) {
        callback();
      }
    });
  };

  public wait = (): Promise<void> => {
    if (this.eventRun) {
      return Promise.resolve();
    }
    return new Promise(this.waitForEvent);
  };

  public reset(): void {
    this.eventRun = false;
    this.waitForEvent();
  }
}
