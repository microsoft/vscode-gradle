import * as vscode from 'vscode';

import { registerGradleViews } from './views';
import { registerTaskProvider, registerTaskManager } from './tasks';
import { registerServer } from './server';
import { registerClient } from './client';
import { registerCommands } from './commands';
import { logger } from './logger';
import { registerBuildFileWatcher } from './buildFileWatcher';
import { Api } from './api';

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
  const statusBarItem = vscode.window.createStatusBarItem();

  logger.setLoggingChannel(vscode.window.createOutputChannel('Gradle Tasks'));

  const server = registerServer({ host: 'localhost' }, context);
  const client = registerClient(server, context);
  const taskProvider = registerTaskProvider(context, client);
  const taskManager = registerTaskManager(context);
  const {
    gradleTasksTreeDataProvider,
    gradleDaemonsTreeDataProvider,
    gradleTasksTreeView,
  } = registerGradleViews(context, taskProvider, client);

  registerBuildFileWatcher(context, taskProvider, taskManager);

  registerCommands(
    context,
    statusBarItem,
    client,
    gradleTasksTreeDataProvider,
    gradleDaemonsTreeDataProvider,
    gradleTasksTreeView,
    taskProvider
  );

  return new Api(client, gradleTasksTreeDataProvider);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
