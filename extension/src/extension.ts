import * as vscode from 'vscode';

import { registerGradleViews } from './views';
import { registerTaskProvider, registerTaskManager } from './tasks';
import { registerServer } from './server';
import { registerClient } from './client';
import { registerCommands } from './commands';
import { logger } from './logger';
import { registerBuildFileWatcher } from './buildFileWatcher';
import { Api } from './api/Api';
import { registerStores } from './stores';

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
  logger.setLoggingChannel(vscode.window.createOutputChannel('Gradle Tasks'));

  const server = registerServer({ host: 'localhost' }, context);
  const client = registerClient(server, context);
  const {
    bookmarkedTasksStore,
    recentTasksStore,
    // taskTerminalsStore,
  } = registerStores(context);
  const taskProvider = registerTaskProvider(
    context
    // taskTerminalsStore
  );

  const {
    gradleTasksTreeDataProvider,
    gradleDaemonsTreeDataProvider,
    bookmarkedTasksTreeDataProvider,
    // recentTasksTreeDataProvider,
    gradleTasksTreeView,
  } = registerGradleViews(
    context,
    taskProvider,
    bookmarkedTasksStore
    // recentTasksStore,
    // taskTerminalsStore
  );
  const taskManager = registerTaskManager(context, recentTasksStore);

  registerBuildFileWatcher(context, taskProvider, taskManager);

  registerCommands(
    context,
    gradleTasksTreeDataProvider,
    gradleDaemonsTreeDataProvider,
    bookmarkedTasksTreeDataProvider,
    // recentTasksTreeDataProvider,
    gradleTasksTreeView,
    taskProvider
    // taskTerminalsStore
  );

  return new Api(client, gradleTasksTreeDataProvider);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
