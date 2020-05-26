import * as vscode from 'vscode';

import { registerGradleViews } from './views';
import { registerTaskProvider, registerTaskManager } from './tasks';
import { registerServer } from './server';
import { registerClient } from './client';
import { registerCommands } from './commands';
import { logger } from './logger';
import { registerBuildFileWatcher } from './buildFileWatcher';
import { Api } from './api/Api';

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
  logger.setLoggingChannel(vscode.window.createOutputChannel('Gradle Tasks'));

  const server = registerServer({ host: 'localhost' }, context);
  const client = registerClient(server, context);
  const taskProvider = registerTaskProvider(context, client);
  const taskManager = registerTaskManager(context);
  const {
    gradleTasksTreeDataProvider,
    gradleDaemonsTreeDataProvider,
    bookmarkedTasksTreeDataProvider,
    gradleTasksTreeView,
  } = registerGradleViews(context, taskProvider, client);

  registerBuildFileWatcher(context, taskProvider, taskManager);

  registerCommands(
    context,
    client,
    gradleTasksTreeDataProvider,
    gradleDaemonsTreeDataProvider,
    bookmarkedTasksTreeDataProvider,
    gradleTasksTreeView,
    taskProvider
  );

  return new Api(client, gradleTasksTreeDataProvider);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
