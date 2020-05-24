import * as vscode from 'vscode';

import { COMMAND_LOAD_TASKS } from '../commands';
import { GradleTasksServer } from '../server/GradleTasksServer';
import { GradleTasksClient } from './GradleTasksClient';

export function registerClient(
  server: GradleTasksServer,
  context: vscode.ExtensionContext
): GradleTasksClient {
  const statusBarItem = vscode.window.createStatusBarItem();
  const client = new GradleTasksClient(server, statusBarItem);
  context.subscriptions.push(client, statusBarItem);
  client.onConnect(() => {
    vscode.commands.executeCommand(COMMAND_LOAD_TASKS);
  });
  return client;
}
