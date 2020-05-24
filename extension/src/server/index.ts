import * as vscode from 'vscode';
import { ServerOptions, GradleTasksServer } from './GradleTasksServer';

export function registerServer(
  opts: ServerOptions,
  context: vscode.ExtensionContext
): GradleTasksServer {
  const server = new GradleTasksServer(opts, context);
  context.subscriptions.push(
    server,
    vscode.workspace.onDidChangeConfiguration(
      (event: vscode.ConfigurationChangeEvent) => {
        if (event.affectsConfiguration('java.home') && server.isReady()) {
          server.restart();
        }
      }
    )
  );
  return server;
}
