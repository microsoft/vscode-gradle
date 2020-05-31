import * as vscode from 'vscode';

import { Api } from './api';
import { Extension } from './extension';

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
  const extension = new Extension(context);
  return extension.getApi();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
