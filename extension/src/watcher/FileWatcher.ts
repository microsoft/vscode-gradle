import * as vscode from 'vscode';

export class FileWatcher implements vscode.Disposable {
  private enabled = true;
  private fileSystemWatcher: vscode.FileSystemWatcher;
  private readonly _onDidChange: vscode.EventEmitter<
    vscode.Uri
  > = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange: vscode.Event<vscode.Uri> = this._onDidChange
    .event;

  constructor(protected readonly buildFileGlob: string) {
    this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
      this.buildFileGlob
    );
    this.fileSystemWatcher.onDidChange(this.fireOnDidChange);
    this.fileSystemWatcher.onDidDelete(this.fireOnDidChange);
    this.fileSystemWatcher.onDidCreate(this.fireOnDidChange);
  }

  public fireOnDidChange = (uri: vscode.Uri): void => {
    if (this.enabled) {
      this._onDidChange.fire(uri);
    }
  };

  protected enable(): void {
    this.enabled = true;
  }

  protected disable(): void {
    this.enabled = false;
  }

  public dispose(): void {
    this.fileSystemWatcher.dispose();
    this._onDidChange.dispose();
  }
}
