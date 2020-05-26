import * as vscode from 'vscode';
import { logger } from '../logger';

type handler = () => void;

export class BuildFileWatcher implements vscode.Disposable {
  private fileSystemWatcher?: vscode.FileSystemWatcher;
  private readonly buildFileGlob = '**/*.{gradle,gradle.kts}';
  private readonly handlers: handler[] = [];

  public addHandler(handler: handler): void {
    this.handlers.push(handler);
  }

  public start(): void {
    if (!this.fileSystemWatcher) {
      this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
        this.buildFileGlob
      );
      this.fileSystemWatcher.onDidChange(this.callHandlers);
      this.fileSystemWatcher.onDidDelete(this.callHandlers);
      this.fileSystemWatcher.onDidCreate(this.callHandlers);
      logger.debug('Build file watcher started');
    }
  }

  public callHandlers = (): void => {
    this.handlers.forEach((handler) => handler());
  };

  public stop(): void {
    if (this.fileSystemWatcher) {
      this.dispose();
      logger.debug('Build file watcher stopped');
    }
  }

  public dispose(): void {
    this.fileSystemWatcher?.dispose();
    this.fileSystemWatcher = undefined;
  }
}
