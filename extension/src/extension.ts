import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

nls.config({ messageFormat: nls.MessageFormat.bundle })();

import { GradleTasksTreeDataProvider, registerExplorer } from './gradleView';
import { registerTaskProvider } from './tasks';
import { registerServer } from './server';
import { registerClient, GradleTasksClient } from './client';
import { registerCommands } from './commands';
import { Logger, logger } from './logger';
import { registerRunTask, RunTaskHandler } from './runTask';

const localize = nls.loadMessageBundle();

export interface ExtensionApi {
  treeDataProvider: GradleTasksTreeDataProvider;
  context: vscode.ExtensionContext;
  client: GradleTasksClient;
  logger: Logger;
  runTask: RunTaskHandler;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi> {
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
  const { treeDataProvider, treeView } = registerExplorer(context);
  const runTask = registerRunTask(client, taskProvider);

  registerCommands(
    context,
    statusBarItem,
    client,
    treeDataProvider,
    treeView,
    taskProvider
  );
  return { treeDataProvider, context, client, logger, runTask };
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
