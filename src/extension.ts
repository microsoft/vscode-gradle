import * as vscode from 'vscode';
import { GradleTasksTreeDataProvider } from './gradleView';
import {
  invalidateTasksCache,
  killRefreshProcess,
  GradleTaskProvider,
  hasGradleProject
} from './tasks';

import { getIsTasksExplorerEnabled } from './config';

let treeDataProvider: GradleTasksTreeDataProvider | undefined;

function registerTaskProvider(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): vscode.Disposable | undefined {
  function invalidateTaskCaches(): void {
    invalidateTasksCache();
    if (treeDataProvider) {
      treeDataProvider.refresh();
    }
  }

  if (vscode.workspace.workspaceFolders) {
    const defaultGroovyBuildFile = '*.gradle';
    const defaultKotlinBuildFile = '*.gradle.kts';
    const buildFiles = new Set<string>();
    buildFiles.add(defaultGroovyBuildFile);
    buildFiles.add(defaultKotlinBuildFile);

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
    statusBarItem.tooltip = 'Cancel';
    statusBarItem.command = 'gradle.killRefreshProcess';

    const provider: vscode.TaskProvider = new GradleTaskProvider(
      statusBarItem,
      outputChannel,
      context
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
  context: vscode.ExtensionContext,
  collapsed: boolean
): void {
  if (vscode.workspace.workspaceFolders) {
    treeDataProvider = new GradleTasksTreeDataProvider(context, collapsed);
    context.subscriptions.push(
      vscode.window.createTreeView('gradleTreeView', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
      })
    );
  }
}

function registerCommands(context: vscode.ExtensionContext): void {
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
        'gradle.runTaskWithArgs',
        treeDataProvider.runTaskWithArgs,
        treeDataProvider
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gradle.stopTask',
        treeDataProvider.stopTask,
        treeDataProvider
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('gradle.refresh', () =>
        treeDataProvider!.refresh()
      )
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('gradle.explorerTree', () => {
        context.workspaceState.update('explorerCollapsed', false);
        treeDataProvider!.setCollapsed(false);
        treeDataProvider!.render();
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('gradle.explorerFlat', () => {
        context.workspaceState.update('explorerCollapsed', true);
        treeDataProvider!.setCollapsed(true);
        treeDataProvider!.render();
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gradle.killRefreshProcess',
        killRefreshProcess
      )
    );
  }
}

export interface ExtensionApi {
  outputChannel: vscode.OutputChannel;
  treeDataProvider: GradleTasksTreeDataProvider | undefined;
  context: vscode.ExtensionContext;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi> {
  const explorerCollapsed = context.workspaceState.get(
    'explorerCollapsed',
    true
  );
  const outputChannel = vscode.window.createOutputChannel('Gradle Tasks');
  context.subscriptions.push(outputChannel);
  registerTaskProvider(context, outputChannel);
  if (await hasGradleProject()) {
    registerExplorer(context, explorerCollapsed);
    registerCommands(context);
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
  return { outputChannel, treeDataProvider, context };
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
