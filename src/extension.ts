import {
  window,
  workspace,
  commands,
  ExtensionContext,
  Disposable,
  TaskProvider,
  StatusBarAlignment
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

    const statusBarItem = window.createStatusBarItem(
      StatusBarAlignment.Left,
      1
    );
    context.subscriptions.push(statusBarItem);

    const provider: TaskProvider = new GradleTaskProvider(statusBarItem);
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

function isTasksExplorerEnabled(): boolean {
  return workspace
    .getConfiguration('gradle')
    .get<boolean>('enableTasksExplorer', true);
}

interface ExtensionApi {}

export async function activate(
  context: ExtensionContext
): Promise<ExtensionApi> {
  registerTaskProvider(context);
  treeDataProvider = registerExplorer(context);
  if (isTasksExplorerEnabled() && (await hasBuildGradle())) {
    commands.executeCommand('setContext', 'gradle:showTasksExplorer', true);
  }
  return {};
}

export function deactivate(): void {}
