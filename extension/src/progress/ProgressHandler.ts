import * as vscode from "vscode";

export class ProgressHandler {
    private readonly _onDidProgressStart: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    public readonly onDidProgressStart: vscode.Event<null> = this._onDidProgressStart.event;

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
            this._onDidProgressStart.fire(null);
            this._onDidProgressStart.dispose();
        }
    }
}
