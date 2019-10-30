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
  hasGradleBuildFile
} from './tasks';

import { getCustomBuildFile, getIsTasksExplorerEnabled } from './config';

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

    const outputChannel = window.createOutputChannel('Gradle Tasks');

    const provider: TaskProvider = new GradleTaskProvider(
      statusBarItem,
      outputChannel
    );
    const taskProvider = workspace.registerTaskProvider('gradle', provider);

    context.subscriptions.push(watcher);
    context.subscriptions.push(workspaceWatcher);
    context.subscriptions.push(statusBarItem);
    context.subscriptions.push(outputChannel);
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
    const view = window.createTreeView('gradle', {
      treeDataProvider: treeDataProvider,
      showCollapseAll: true
    });
    context.subscriptions.push(view);
    return treeDataProvider;
  }
  return undefined;
}

interface ExtensionApi {}

export async function activate(
  context: ExtensionContext
): Promise<ExtensionApi> {
  registerTaskProvider(context);
  treeDataProvider = registerExplorer(context);
  const hasBuildFile = await hasGradleBuildFile();
  if (!hasBuildFile) {
    window.showWarningMessage('No gradle build file found');
  } else if (getIsTasksExplorerEnabled()) {
    commands.executeCommand('setContext', 'gradle:showTasksExplorer', true);
  }
  return {};
}

export function deactivate(): void {}
