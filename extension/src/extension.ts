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

const localize = nls.loadMessageBundle();

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
  const statusBarItem = vscode.window.createStatusBarItem();
  statusBarItem.command = 'gradle.showProcessMessage';
  statusBarItem.text = localize(
    'extension.starting',
    '{0} Gradle: Starting',
    '$(sync~spin)'
  );
  statusBarItem.show();

  logger.setLoggingChannel(vscode.window.createOutputChannel('Gradle Tasks'));

  const server = registerServer({ host: 'localhost' }, context);
  const client = registerClient(server, statusBarItem, context);
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

  const api = new Api(client, taskProvider, treeDataProvider);
  context.subscriptions.push(api);

  return api;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
