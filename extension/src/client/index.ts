import * as vscode from 'vscode';

import { GradleServer } from '../server/GradleServer';
import { GradleClient } from './GradleClient';
import { COMMAND_LOAD_TASKS } from '../commands/constants';

export function registerClient(
  server: GradleServer,
  context: vscode.ExtensionContext
): GradleClient {
  const statusBarItem = vscode.window.createStatusBarItem();
  const client = new GradleClient(server, statusBarItem);
  context.subscriptions.push(client, statusBarItem);
  client.onDidConnect(() => {
    vscode.commands.executeCommand(COMMAND_LOAD_TASKS);
  });
  return client;
}
