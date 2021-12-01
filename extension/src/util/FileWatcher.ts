import * as vscode from "vscode";
import * as minimatch from "minimatch";

export class FileWatcher implements vscode.Disposable {
    private readonly _onDidChange: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();
    private readonly _onDidOpen: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange: vscode.Event<vscode.Uri> = this._onDidChange.event;
    public readonly onDidOpen: vscode.Event<vscode.Uri> = this._onDidOpen.event;
    private onDidSaveDisposable: vscode.Disposable;
    private onDidDeleteDisposable: vscode.Disposable;
    private onDidCreateDisposable: vscode.Disposable;
    private onDidOpenDisposable: vscode.Disposable;

    constructor(protected readonly fileGlob: string) {
        this.onDidSaveDisposable = vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => {
            if (this.isFileMatching(doc.uri)) {
                this.fireOnDidChange(doc.uri);
            }
        });
        this.onDidDeleteDisposable = vscode.workspace.onDidDeleteFiles((event: vscode.FileDeleteEvent) => {
            const fileDeleted = event.files.find((file) => this.isFileMatching(file));
            if (fileDeleted) {
                this.fireOnDidChange(fileDeleted);
            }
        });
        this.onDidCreateDisposable = vscode.workspace.onDidCreateFiles((event: vscode.FileDeleteEvent) => {
            const fileCreated = event.files.find((file) => this.isFileMatching(file));
            if (fileCreated) {
                this.fireOnDidChange(fileCreated);
            }
        });
        this.onDidOpenDisposable = vscode.workspace.onDidOpenTextDocument((e: vscode.TextDocument) => {
            if (this.isFileMatching(e.uri)) {
                this.fireOnDidOpen(e.uri);
            }
        });
    }

    private isFileMatching(uri: vscode.Uri): boolean {
        if (uri.scheme !== "file") {
            return false;
        }
        return minimatch(uri.fsPath, this.fileGlob);
    }

    public fireOnDidChange = (uri: vscode.Uri): void => {
        this._onDidChange.fire(uri);
    };

    public fireOnDidOpen = (uri: vscode.Uri): void => {
        this._onDidOpen.fire(uri);
    };

    public dispose(): void {
        this.onDidSaveDisposable.dispose();
        this.onDidDeleteDisposable.dispose();
        this.onDidCreateDisposable.dispose();
        this.onDidOpenDisposable.dispose();
        this._onDidChange.dispose();
        this._onDidOpen.dispose();
    }
}
