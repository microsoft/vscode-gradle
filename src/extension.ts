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
    const buildFileGlob = `**/*.{gradle,gradle.kts}`;
    const watcher = vscode.workspace.createFileSystemWatcher(buildFileGlob);
    watcher.onDidChange(() => invalidateTaskCaches());
    watcher.onDidDelete(() => invalidateTaskCaches());
    watcher.onDidCreate(() => invalidateTaskCaches());

    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() =>
      invalidateTaskCaches()
    );

    const statusBarItem = vscode.window.createStatusBarItem();
    statusBarItem.tooltip = 'Cancel';
    statusBarItem.command = 'gradle.showRefreshInformationMessage';

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

function registerCommands(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): void {
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
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gradle.showRefreshInformationMessage',
        async () => {
          const OPT_LOGS = 'View Logs';
          const OPT_CANCEL = 'Cancel Process';
          const input = await vscode.window.showInformationMessage(
            'Gradle Refresh Process',
            OPT_LOGS,
            OPT_CANCEL
          );
          if (input === OPT_LOGS) {
            outputChannel.show();
          } else if (input === OPT_CANCEL) {
            vscode.commands.executeCommand('gradle.killRefreshProcess');
          }
        }
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
    registerCommands(context, outputChannel);
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
