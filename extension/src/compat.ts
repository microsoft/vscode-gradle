import * as vscode from 'vscode';

export const JAVA_LANGUAGE_EXTENSION_ID = 'redhat.java';
export const JAVA_DEBUGGER_EXTENSION_ID = 'vscjava.vscode-java-debug';
export const JAVA_CONFIGURATION_UPDATE_COMMAND =
  'java.projectConfiguration.update';

export function isJavaLanguageSupportExtensionActivated(): boolean {
  const javaExt:
    | vscode.Extension<unknown>
    | undefined = getJavaDebuggerExtension();
  return !!javaExt && javaExt.isActive;
}

export function isJavaDebuggerExtensionActivated(): boolean {
  const javaExt:
    | vscode.Extension<unknown>
    | undefined = getJavaLanguageSupportExtension();
  return !!javaExt && javaExt.isActive;
}

export function getJavaLanguageSupportExtension():
  | vscode.Extension<unknown>
  | undefined {
  return vscode.extensions.getExtension(JAVA_LANGUAGE_EXTENSION_ID);
}

export function getJavaDebuggerExtension():
  | vscode.Extension<unknown>
  | undefined {
  return vscode.extensions.getExtension(JAVA_DEBUGGER_EXTENSION_ID);
}
