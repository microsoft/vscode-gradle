import * as vscode from 'vscode';

import { GradleTasksTreeDataProvider, registerExplorer } from './gradleView';
import { registerTaskProvider } from './tasks';
import { registerServer } from './server';
import { registerClient, GradleTasksClient } from './client';
import { registerCommands } from './commands';
import { logger } from './logger';

export interface ExtensionApi {
  treeDataProvider: GradleTasksTreeDataProvider;
  context: vscode.ExtensionContext;
  client: GradleTasksClient;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi | void> {
  const statusBarItem = vscode.window.createStatusBarItem();
  statusBarItem.command = 'gradle.showProcessMessage';

  logger.setLoggingChannel(vscode.window.createOutputChannel('Gradle Tasks'));

  const server = registerServer({ host: 'localhost' }, context);
  const client = registerClient(server, statusBarItem, context);
  const taskProvider = registerTaskProvider(context, client);
  const treeDataProvider = registerExplorer(context, client);
  registerCommands(
    context,
    statusBarItem,
    client,
    treeDataProvider,
    taskProvider
  );
  return { treeDataProvider, context, client };
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
