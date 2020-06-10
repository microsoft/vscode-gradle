import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logger';
import { getConfigJavaHome } from '../config';
import { isTest } from '../util';

export const SERVER_TASK_NAME = 'Gradle Server';

export function getGradleServerCommand(): string {
  const platform = process.platform;
  if (platform === 'win32') {
    return 'gradle-server.bat';
  } else if (platform === 'linux' || platform === 'darwin') {
    return 'gradle-server';
  } else {
    throw new Error('Unsupported platform');
  }
}

export function buildGradleServerTask(
  cwd: string,
  args: string[] = []
): vscode.Task {
  const cmd = path.join(cwd, getGradleServerCommand());
  logger.debug(`Gradle Server cmd: ${cmd} ${args.join(' ')}`);
  const taskType = 'gradleserver';
  const definition = {
    type: taskType,
  };
  const javaHome = getConfigJavaHome();
  const env = {};
  if (javaHome) {
    Object.assign(env, {
      VSCODE_JAVA_HOME: javaHome,
    });
  }
  const task = new vscode.Task(
    definition,
    vscode.TaskScope.Workspace,
    SERVER_TASK_NAME,
    taskType,
    new vscode.ProcessExecution(cmd, args, { env })
  );
  // This helps reduce the "The specified task is missing an execution" errors in CI
  if (!isTest()) {
    task.presentationOptions = {
      showReuseMessage: false,
      clear: true,
      echo: false,
      focus: false,
      panel: vscode.TaskPanelKind.Shared,
      reveal: vscode.TaskRevealKind.Silent,
    };
  }
  return task;
}
