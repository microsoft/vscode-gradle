import * as vscode from 'vscode';
import { ServerOptions, GradleServer } from './GradleServer';

export function registerServer(
  opts: ServerOptions,
  context: vscode.ExtensionContext
): GradleServer {
  const server = new GradleServer(opts, context);
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
