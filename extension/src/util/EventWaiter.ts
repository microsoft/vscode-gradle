import * as vscode from "vscode";

type callback = () => void;

export class EventWaiter<T = null> {
    private eventRun = false;
    private activeDisposable: vscode.Disposable | undefined;

    constructor(private readonly event: vscode.Event<T>) {
        this.waitForEvent();
    }

    public waitForEvent = (callback?: callback): void => {
        this.activeDisposable?.dispose();
        const disposable = this.event(() => {
            disposable.dispose();
            this.activeDisposable = undefined;
            this.eventRun = true;
            if (callback) {
                callback();
            }
        });
        this.activeDisposable = disposable;
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
