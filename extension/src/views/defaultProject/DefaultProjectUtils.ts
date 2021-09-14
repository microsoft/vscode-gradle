// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';

export async function setDefault(): Promise<void> {
  await vscode.commands.executeCommand(
    'setContext',
    'gradle:defaultView',
    true
  );
}

export async function unsetDefault(): Promise<void> {
  await vscode.commands.executeCommand(
    'setContext',
    'gradle:defaultView',
    false
  );
}
