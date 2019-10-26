import {
  window,
  workspace,
  commands,
  ExtensionContext,
  Disposable,
  TaskProvider
} from 'vscode';
import { GradleTasksTreeDataProvider } from './gradleView';
import {
  invalidateTasksCache,
  GradleTaskProvider,
  hasBuildGradle
} from './tasks';

let treeDataProvider: GradleTasksTreeDataProvider | undefined;

function registerTaskProvider(
  context: ExtensionContext
): Disposable | undefined {
  function invalidateTaskCaches() {
    invalidateTasksCache();
    if (treeDataProvider) {
      treeDataProvider.refresh();
    }
  }

  if (workspace.workspaceFolders) {
    const watcher = workspace.createFileSystemWatcher('**/build.gradle');
    watcher.onDidChange(() => invalidateTaskCaches());
    watcher.onDidDelete(() => invalidateTaskCaches());
    watcher.onDidCreate(() => invalidateTaskCaches());
    context.subscriptions.push(watcher);

    const workspaceWatcher = workspace.onDidChangeWorkspaceFolders(() =>
      invalidateTaskCaches()
    );
    context.subscriptions.push(workspaceWatcher);

    const provider: TaskProvider = new GradleTaskProvider();
    const disposable = workspace.registerTaskProvider('gradle', provider);
    context.subscriptions.push(disposable);
    return disposable;
  }
  return undefined;
}

function registerExplorer(
  context: ExtensionContext
): GradleTasksTreeDataProvider | undefined {
  if (workspace.workspaceFolders) {
    const treeDataProvider = new GradleTasksTreeDataProvider(context);
    const view = window.createTreeView('gradle', {
      treeDataProvider: treeDataProvider,
      showCollapseAll: true
    });
    context.subscriptions.push(view);
    return treeDataProvider;
  }
  return undefined;
}

export async function activate(context: ExtensionContext): Promise<void> {
  registerTaskProvider(context);
  treeDataProvider = registerExplorer(context);
  if (await hasBuildGradle()) {
    commands.executeCommand('setContext', 'gradle:showTaskExplorer', true);
  }
}

export function deactivate(): void {}
