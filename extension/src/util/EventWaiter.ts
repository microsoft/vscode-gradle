import * as vscode from "vscode";

/**
 * Waits for a VS Code event to fire, supporting reset for repeated waits.
 *
 * Design: a single background listener captures the event and resolves all
 * pending wait() callers.  reset() replaces only that background listener,
 * so it never invalidates an in-flight wait() Promise.
 */
export class EventWaiter<T = null> {
    private eventRun = false;
    private backgroundDisposable: vscode.Disposable | undefined;
    private pendingResolvers: Set<() => void> = new Set();

    constructor(private readonly event: vscode.Event<T>) {
        this.listen();
    }

    private listen(): void {
        this.backgroundDisposable?.dispose();
        const disposable = this.event(() => {
            disposable.dispose();
            this.backgroundDisposable = undefined;
            this.eventRun = true;
            for (const resolve of this.pendingResolvers) {
                resolve();
            }
            this.pendingResolvers.clear();
        });
        this.backgroundDisposable = disposable;
    }

    public wait = (): Promise<void> => {
        if (this.eventRun) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            this.pendingResolvers.add(resolve);
        });
    };

    public reset(): void {
        this.eventRun = false;
        this.listen();
    }
}
