import * as vscode from 'vscode';

import { Api } from './api';
import { Extension } from './extension';

export function activate(context: vscode.ExtensionContext): Api {
  const extension = new Extension(context);
  void extension.activate();
  return extension.getApi();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
