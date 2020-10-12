import * as vscode from 'vscode';

import { Api } from './api';
import { Extension } from './Extension';

export function activate(context: vscode.ExtensionContext): Api {
  return new Extension(context).getApi();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
