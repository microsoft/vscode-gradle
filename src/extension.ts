import * as vscode from 'vscode';
import { GradleTasksTreeDataProvider } from './gradleView';
import {
  invalidateTasksCache,
  GradleTaskProvider,
  hasGradleBuildFile
} from './tasks';

import { getCustomBuildFile, getIsTasksExplorerEnabled } from './config';

let treeDataProvider: GradleTasksTreeDataProvider | undefined;

function registerTaskProvider(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): vscode.Disposable | undefined {
  function invalidateTaskCaches() {
    invalidateTasksCache();
    if (treeDataProvider) {
      treeDataProvider.refresh();
    }
  }

  if (vscode.workspace.workspaceFolders) {
    const defaultGroovyBuildFile = 'build.gradle';
    const defaultKotlinBuildFile = 'build.gradle.kts';
    const buildFiles = new Set<string>();
    for (const folder of vscode.workspace.workspaceFolders) {
      const customBuildFile = getCustomBuildFile(folder.uri);
      if (customBuildFile) {
        buildFiles.add(customBuildFile);
      } else {
        buildFiles.add(defaultGroovyBuildFile);
        buildFiles.add(defaultKotlinBuildFile);
      }
    }

    const buildFileGlob = `**/{${Array.from(buildFiles).join(',')}}`;
    const watcher = vscode.workspace.createFileSystemWatcher(buildFileGlob);
    watcher.onDidChange(() => invalidateTaskCaches());
    watcher.onDidDelete(() => invalidateTaskCaches());
    watcher.onDidCreate(() => invalidateTaskCaches());

    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() =>
      invalidateTaskCaches()
    );

    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      1
    );

    const provider: vscode.TaskProvider = new GradleTaskProvider(
      statusBarItem,
      outputChannel
    );
    const taskProvider = vscode.tasks.registerTaskProvider('gradle', provider);

    context.subscriptions.push(watcher);
    context.subscriptions.push(workspaceWatcher);
    context.subscriptions.push(statusBarItem);
    context.subscriptions.push(taskProvider);
    return taskProvider;
  }
  return undefined;
}

function registerExplorer(
  context: vscode.ExtensionContext
): GradleTasksTreeDataProvider | undefined {
  if (vscode.workspace.workspaceFolders) {
    const treeDataProvider = new GradleTasksTreeDataProvider(context);
    context.subscriptions.push(
      vscode.window.createTreeView('gradle-tree-view', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
      })
    );
    return treeDataProvider;
  }
  return undefined;
}

function registerCommands(
  context: vscode.ExtensionContext,
  treeDataProvider: GradleTasksTreeDataProvider | undefined
) {
  if (treeDataProvider) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gradle.runTask',
        treeDataProvider.runTask,
        treeDataProvider
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gradle.refresh',
        treeDataProvider.refresh,
        treeDataProvider
      )
    );
  }
}

export interface ExtensionApi {
  outputChannel: vscode.OutputChannel;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi> {
  const outputChannel = vscode.window.createOutputChannel('Gradle Tasks');
  context.subscriptions.push(outputChannel);
  registerTaskProvider(context, outputChannel);
  if (await hasGradleBuildFile()) {
    treeDataProvider = registerExplorer(context);
    registerCommands(context, treeDataProvider);
    if (treeDataProvider) {
      treeDataProvider.refresh();
    }
    if (getIsTasksExplorerEnabled()) {
      vscode.commands.executeCommand(
        'setContext',
        'gradle:showTasksExplorer',
        true
      );
    }
  }
  return { outputChannel };
}

export function deactivate(): void {}
