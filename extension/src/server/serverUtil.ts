import * as vscode from 'vscode';
import { logger } from '../logger';
import { getConfigJavaHome } from '../config';

export const SERVER_TASK_NAME = 'Gradle Tasks Server';

export function getGradleServerCommand(): string {
  const platform = process.platform;
  if (platform === 'win32') {
    return '.\\gradle-server.bat';
  } else if (platform === 'linux' || platform === 'darwin') {
    return './gradle-server';
  } else {
    throw new Error('Unsupported platform');
  }
}

export function buildGradleServerTask(
  taskName: string,
  cwd: string,
  args: string[] = []
): vscode.Task {
  const cmd = `"${getGradleServerCommand()}"`;
  logger.debug(`Gradle Tasks Server dir: ${cwd}`);
  logger.debug(`Gradle Tasks Server cmd: ${cmd} ${args.join(' ')}`);
  const taskType = 'gradle';
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
  return new vscode.Task(
    definition,
    vscode.TaskScope.Workspace,
    taskName,
    taskType,
    new vscode.ShellExecution(cmd, args, { cwd, env })
  );
}
