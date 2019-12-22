import * as vscode from 'vscode';
import getPort from 'get-port';

import { GradleTasksTreeDataProvider } from './gradleView';
import {
  GradleTaskProvider,
  hasGradleProject,
  setStoppedTaskAsComplete
} from './tasks';
import { registerServer, GradleTasksServer } from './server';
import {
  registerClient,
  GradleTasksClient,
  ServerCancelledMessage
} from './client';
import {
  registerRunTaskCommand,
  registerRunTaskWithArgsCommand,
  registerStopTaskCommand,
  registerStopTreeItemTaskCommand,
  registerRefreshCommand,
  registerExplorerTreeCommand,
  registerExplorerFlatCommand,
  registerKillGradleProcessCommand,
  registerShowGradleProcessInformationMessageCommand,
  registerOpenSettingsCommand,
  registerOpenBuildFileCommand,
  registerStoppingTreeItemTaskCommand
} from './commands';

let treeDataProvider: GradleTasksTreeDataProvider | undefined;

function registerTaskProvider(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
  statusBarItem: vscode.StatusBarItem
): GradleTaskProvider | undefined {
  function refreshTasks(): void {
    vscode.commands.executeCommand('gradle.refresh', false);
  }

  if (vscode.workspace.workspaceFolders) {
    const buildFileGlob = `**/*.{gradle,gradle.kts}`;
    const watcher = vscode.workspace.createFileSystemWatcher(buildFileGlob);
    context.subscriptions.push(watcher);
    watcher.onDidChange(refreshTasks);
    watcher.onDidDelete(refreshTasks);
    watcher.onDidCreate(refreshTasks);

    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(
      refreshTasks
    );
    context.subscriptions.push(workspaceWatcher);

    const provider = new GradleTaskProvider(
      statusBarItem,
      outputChannel,
      context
    );

    const taskProvider = vscode.tasks.registerTaskProvider('gradle', provider);
    context.subscriptions.push(taskProvider);

    return provider;
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
  outputChannel: vscode.OutputChannel,
  statusBarItem: vscode.StatusBarItem,
  client: GradleTasksClient,
  taskProvider?: GradleTaskProvider
): void {
  if (treeDataProvider && taskProvider) {
    context.subscriptions.push(
      registerRunTaskCommand(treeDataProvider),
      registerRunTaskWithArgsCommand(treeDataProvider),
      registerStopTaskCommand(statusBarItem),
      registerStopTreeItemTaskCommand(),
      registerRefreshCommand(taskProvider, treeDataProvider),
      registerExplorerTreeCommand(treeDataProvider),
      registerExplorerFlatCommand(treeDataProvider),
      registerKillGradleProcessCommand(client, statusBarItem),
      registerShowGradleProcessInformationMessageCommand(outputChannel),
      registerOpenSettingsCommand(),
      registerOpenBuildFileCommand(),
      registerStoppingTreeItemTaskCommand()
    );
  }
}

export interface ExtensionApi {
  treeDataProvider: GradleTasksTreeDataProvider | undefined;
  context: vscode.ExtensionContext;
  outputChannel: vscode.OutputChannel;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi | void> {
  const outputChannel = vscode.window.createOutputChannel('Gradle Tasks');
  context.subscriptions.push(outputChannel);

  let server: GradleTasksServer | undefined;
  let client: GradleTasksClient | undefined;

  const statusBarItem = vscode.window.createStatusBarItem();
  context.subscriptions.push(statusBarItem);
  statusBarItem.command = 'gradle.showGradleProcessInformationMessage';

  const taskProvider = registerTaskProvider(
    context,
    outputChannel,
    statusBarItem
  );

  if (await hasGradleProject()) {
    const port = await getPort();
    try {
      server = await registerServer(
        { port, host: 'localhost' },
        outputChannel,
        context
      );
      context.subscriptions.push(server);
    } catch (e) {
      outputChannel.appendLine(`Unable to start tasks server: ${e.toString()}`);
      return;
    }

    try {
      client = await registerClient(server, outputChannel, statusBarItem);
      context.subscriptions.push(client);
    } catch (e) {
      outputChannel.appendLine(
        `Unable to connect to tasks server: ${e.toString()}`
      );
      return;
    }

    if (client) {
      taskProvider?.setClient(client);
      const explorerCollapsed = context.workspaceState.get(
        'explorerCollapsed',
        false
      );
      registerExplorer(context, explorerCollapsed, client);
      client.addCancelledListener((message: ServerCancelledMessage): void => {
        setStoppedTaskAsComplete(message.task, message.sourceDir);
        treeDataProvider?.render();
        outputChannel.appendLine(`Task cancelled: ${message.message}`);
      });
      registerCommands(
        context,
        outputChannel,
        statusBarItem,
        client,
        taskProvider
      );
      vscode.commands.executeCommand('gradle.refresh', false);
    }
  }
  return { treeDataProvider, context, outputChannel };
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
