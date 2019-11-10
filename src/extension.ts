import {
  window,
  workspace,
  commands,
  ExtensionContext,
  Disposable,
  TaskProvider,
  StatusBarAlignment,
  OutputChannel
} from 'vscode';
import { GradleTasksTreeDataProvider } from './gradleView';
import {
  invalidateTasksCache,
  GradleTaskProvider,
  hasGradleBuildFile
} from './tasks';

import { getCustomBuildFile, getIsTasksExplorerEnabled } from './config';

let treeDataProvider: GradleTasksTreeDataProvider | undefined;

function registerTaskProvider(
  context: ExtensionContext,
  outputChannel: OutputChannel
): Disposable | undefined {
  function invalidateTaskCaches() {
    invalidateTasksCache();
    if (treeDataProvider) {
      treeDataProvider.refresh();
    }
  }

  if (workspace.workspaceFolders) {
    const defaultGroovyBuildFile = 'build.gradle';
    const defaultKotlinBuildFile = 'build.gradle.kts';
    const buildFiles = new Set<string>();
    for (const folder of workspace.workspaceFolders) {
      const customBuildFile = getCustomBuildFile(folder);
      if (customBuildFile) {
        buildFiles.add(customBuildFile);
      } else {
        buildFiles.add(defaultGroovyBuildFile);
        buildFiles.add(defaultKotlinBuildFile);
      }
    }

    const buildFileGlob = `**/{${Array.from(buildFiles).join(',')}}`;
    const watcher = workspace.createFileSystemWatcher(buildFileGlob);
    watcher.onDidChange(() => invalidateTaskCaches());
    watcher.onDidDelete(() => invalidateTaskCaches());
    watcher.onDidCreate(() => invalidateTaskCaches());

    const workspaceWatcher = workspace.onDidChangeWorkspaceFolders(() =>
      invalidateTaskCaches()
    );

    const statusBarItem = window.createStatusBarItem(
      StatusBarAlignment.Left,
      1
    );

    const provider: TaskProvider = new GradleTaskProvider(
      statusBarItem,
      outputChannel
    );
    const taskProvider = workspace.registerTaskProvider('gradle', provider);

    context.subscriptions.push(watcher);
    context.subscriptions.push(workspaceWatcher);
    context.subscriptions.push(statusBarItem);
    context.subscriptions.push(taskProvider);
    return taskProvider;
  }
  return undefined;
}

function registerExplorer(
  context: ExtensionContext
): GradleTasksTreeDataProvider | undefined {
  if (workspace.workspaceFolders) {
    const treeDataProvider = new GradleTasksTreeDataProvider(context);
    treeDataProvider.refresh();
    context.subscriptions.push(
      window.createTreeView('gradle', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
      })
    );
    context.subscriptions.push(
      commands.registerCommand(
        'gradle.runTask',
        treeDataProvider.runTask,
        treeDataProvider
      )
    );
    context.subscriptions.push(
      commands.registerCommand(
        'gradle.refresh',
        treeDataProvider.refresh,
        treeDataProvider
      )
    );
    return treeDataProvider;
  }
  return undefined;
}

interface ExtensionApi {}

export async function activate(
  context: ExtensionContext
): Promise<ExtensionApi> {
  const outputChannel = window.createOutputChannel('Gradle Tasks');
  context.subscriptions.push(outputChannel);
  registerTaskProvider(context, outputChannel);
  treeDataProvider = registerExplorer(context);
  if ((await hasGradleBuildFile()) && getIsTasksExplorerEnabled()) {
    commands.executeCommand('setContext', 'gradle:showTasksExplorer', true);
  }
  return { outputChannel };
}

export function deactivate(): void {}
