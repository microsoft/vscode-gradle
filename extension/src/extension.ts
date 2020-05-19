import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

nls.config({ messageFormat: nls.MessageFormat.bundle })();

import { registerExplorer } from './gradleView';
import { registerTaskProvider } from './tasks';
import { registerServer } from './server';
import { registerClient } from './client';
import { registerCommands } from './commands';
import { logger } from './logger';
import { registerTaskManager } from './taskManager';
import { registerBuildFileWatcher } from './buildFileWatcher';
import { Api } from './api';

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
  const statusBarItem = vscode.window.createStatusBarItem();

  logger.setLoggingChannel(vscode.window.createOutputChannel('Gradle Tasks'));

  const server = registerServer({ host: 'localhost' }, context);
  const client = registerClient(server, context);
  const taskProvider = registerTaskProvider(context, client);
  const taskManager = registerTaskManager(context);
  const { treeDataProvider, treeView } = registerExplorer(context);

  registerBuildFileWatcher(context, taskProvider, taskManager);

  registerCommands(
    context,
    statusBarItem,
    client,
    treeDataProvider,
    treeView,
    taskProvider
  );

  return new Api(client, taskProvider, treeDataProvider);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
