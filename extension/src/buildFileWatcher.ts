import * as vscode from 'vscode';
import { logger } from './logger';
import { GradleTaskProvider } from './tasks';
import { GradleTaskManager } from './taskManager';

type handler = () => void;

export default class BuildFileWatcher implements vscode.Disposable {
  private fileSystemWatcher?: vscode.FileSystemWatcher;
  private buildFileGlob = '**/*.{gradle,gradle.kts}';
  private handlers: handler[] = [];

  addHandler(handler: handler): void {
    this.handlers.push(handler);
  }

  start(): void {
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

  callHandlers = (): void => {
    this.handlers.forEach((handler) => handler());
  };

  stop(): void {
    if (this.fileSystemWatcher) {
      this.dispose();
      logger.debug('Build file watcher stopped');
    }
  }

  dispose(): void {
    this.fileSystemWatcher?.dispose();
  }
}

export function registerBuildFileWatcher(
  context: vscode.ExtensionContext,
  taskProvider: GradleTaskProvider,
  taskManager: GradleTaskManager
): BuildFileWatcher {
  const buildFileWatcher = new BuildFileWatcher();
  buildFileWatcher.addHandler(() => {
    vscode.commands.executeCommand('gradle.refresh');
  });

  taskProvider.onDidRefreshStart(() => buildFileWatcher.stop());
  taskProvider.onDidRefreshStop(() => buildFileWatcher.start());

  taskManager.onDidEndAllTasks(() => buildFileWatcher.start());
  taskManager.onDidStartTask(() => buildFileWatcher.stop());

  context.subscriptions.push(buildFileWatcher);
  return buildFileWatcher;
}
