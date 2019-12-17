import * as vscode from 'vscode';
import getPort from 'get-port';

import { GradleTasksTreeDataProvider } from './gradleView';
import {
  invalidateTasksCache,
  killRefreshProcess,
  GradleTaskProvider,
  hasGradleProject
} from './tasks';
import {
  registerServer,
  registerClient,
  GradleTasksClient,
  GradleTasksServer
} from './server';

import { getIsTasksExplorerEnabled } from './config';

let treeDataProvider: GradleTasksTreeDataProvider | undefined;

function registerTaskProvider(
  context: vscode.ExtensionContext,
  client: GradleTasksClient,
  outputChannel: vscode.OutputChannel,
  statusBarItem: vscode.StatusBarItem
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
    context.subscriptions.push(watcher);
    watcher.onDidChange(invalidateTaskCaches);
    watcher.onDidDelete(invalidateTaskCaches);
    watcher.onDidCreate(invalidateTaskCaches);

    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(
      invalidateTaskCaches
    );
    context.subscriptions.push(workspaceWatcher);

    const provider: vscode.TaskProvider = new GradleTaskProvider(
      statusBarItem,
      outputChannel,
      context,
      client
    );

    const taskProvider = vscode.tasks.registerTaskProvider('gradle', provider);
    context.subscriptions.push(taskProvider);

    return taskProvider;
  }
  return undefined;
}

function registerExplorer(
  context: vscode.ExtensionContext,
  collapsed: boolean,
  client: GradleTasksClient
): void {
  if (vscode.workspace.workspaceFolders) {
    treeDataProvider = new GradleTasksTreeDataProvider(
      context,
      collapsed,
      client
    );
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
        treeDataProvider!.setCollapsed(false);
      })
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('gradle.explorerFlat', () => {
        treeDataProvider!.setCollapsed(true);
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
  treeDataProvider: GradleTasksTreeDataProvider | undefined;
  context: vscode.ExtensionContext;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi> {
  if (await hasGradleProject()) {
    const explorerCollapsed = context.workspaceState.get(
      'explorerCollapsed',
      true
    );
    const outputChannel = vscode.window.createOutputChannel('Gradle Tasks');
    context.subscriptions.push(outputChannel);

    const statusBarItem = vscode.window.createStatusBarItem();
    context.subscriptions.push(statusBarItem);
    statusBarItem.command = 'gradle.showRefreshInformationMessage';

    let server: GradleTasksServer | undefined;
    let client: GradleTasksClient | undefined;

    const port = await getPort();
    try {
      server = await registerServer(
        { port, host: 'localhost' },
        outputChannel,
        context
      );
      context.subscriptions.push(server);
      client = await registerClient(server, outputChannel, statusBarItem);
    } catch (e) {
      outputChannel.appendLine(`Unable to start tasks server: ${e.toString()}`);
    }

    if (client) {
      registerTaskProvider(context, client, outputChannel, statusBarItem);
      registerExplorer(context, explorerCollapsed, client);
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
  }
  return { treeDataProvider, context };
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
