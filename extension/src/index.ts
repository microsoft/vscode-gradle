import * as vscode from 'vscode';

import { Api } from './api/Api';
import { Extension } from './extension/Extension';

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
  const extension = new Extension(context);
  return extension.getApi();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
