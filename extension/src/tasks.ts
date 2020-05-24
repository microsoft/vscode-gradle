import * as vscode from 'vscode';

import { getConfigJavaHome } from './config';
import { logger } from './logger';
import { GradleTasksClient } from './client';
import { SERVER_TASK_NAME } from './server';
import {
  getJavaLanguageSupportExtension,
  getJavaDebuggerExtension,
  JAVA_LANGUAGE_EXTENSION_ID,
  JAVA_DEBUGGER_EXTENSION_ID,
  isJavaDebuggerExtensionActivated,
} from './compat';
import { GradleTasksTreeDataProvider } from './views/GradleTasksTreeDataProvider';
import { GradleTaskDefinition } from './tasks/GradleTaskDefinition';
import {
  GradleTaskProvider,
  createTaskFromDefinition,
} from './tasks/GradleTaskProvider';
import { COMMAND_REFRESH, COMMAND_REFRESH_DAEMON_STATUS } from './commands';

const cancellingTasks: Map<string, vscode.Task> = new Map();
const restartingTasks: Map<string, vscode.Task> = new Map();

export function getTaskExecution(
  task: vscode.Task
): vscode.TaskExecution | undefined {
  return vscode.tasks.taskExecutions.find((e) => isTask(e.task, task));
}

function isTask(task1: vscode.Task, task2: vscode.Task): boolean {
  return task1.definition.id === task2.definition.id;
}

export function isGradleTask(task: vscode.Task): boolean {
  return task.definition.type === 'gradle' && task.name !== SERVER_TASK_NAME;
}

export function getRunningGradleTasks(): vscode.Task[] {
  return vscode.tasks.taskExecutions
    .filter(({ task }) => isGradleTask(task))
    .map(({ task }) => task);
}

export function cancelTask(
  client: GradleTasksClient,
  treeDataProvider: GradleTasksTreeDataProvider,
  task: vscode.Task
): void {
  if (isTaskRunning(task)) {
    cancellingTasks.set(task.definition.id, task);
    treeDataProvider.renderTask(task);
    client.cancelRunTask(task);
  }
}

export function isTaskRunning(task: vscode.Task): boolean {
  return getTaskExecution(task) !== undefined;
}

export function isTaskCancelling(task: vscode.Task): boolean {
  return cancellingTasks.has(task.definition.id);
}

export function isTaskRestarting(task: vscode.Task): boolean {
  return restartingTasks.has(task.definition.id);
}

export function hasRestartingTask(task: vscode.Task): boolean {
  return getRestartingTask(task) !== undefined;
}

export function getCancellingTask(task: vscode.Task): vscode.Task | void {
  return cancellingTasks.get(task.definition.id);
}

export function getRestartingTask(task: vscode.Task): vscode.Task | void {
  return restartingTasks.get(task.definition.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isWorkspaceFolder(value: any): value is vscode.WorkspaceFolder {
  return value && typeof value !== 'number';
}

export function getGradleTasksServerCommand(): string {
  const platform = process.platform;
  if (platform === 'win32') {
    return '.\\tasks-server.bat';
  } else if (platform === 'linux' || platform === 'darwin') {
    return './tasks-server';
  } else {
    throw new Error('Unsupported platform');
  }
}

export function cloneTask(
  task: vscode.Task,
  args: string,
  client: GradleTasksClient,
  javaDebug = false
): vscode.Task {
  const folder = task.scope as vscode.WorkspaceFolder;
  const definition: GradleTaskDefinition = {
    ...(task.definition as GradleTaskDefinition),
    args,
    javaDebug,
  };
  return createTaskFromDefinition(
    definition as GradleTaskDefinition,
    folder,
    vscode.Uri.file(definition.projectFolder),
    client
  );
}

export function buildGradleServerTask(
  taskName: string,
  cwd: string,
  args: string[] = []
): vscode.Task {
  const cmd = `"${getGradleTasksServerCommand()}"`;
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

export function restartQueuedTask(task: vscode.Task): void {
  const restartingTask = getRestartingTask(task);
  if (restartingTask) {
    restartingTasks.delete(restartingTask.definition.id);
    vscode.tasks.executeTask(restartingTask);
  }
}

export async function removeCancellingTask(task: vscode.Task): Promise<void> {
  const cancellingTask = getCancellingTask(task);
  if (cancellingTask) {
    cancellingTasks.delete(cancellingTask.definition.id);
  }
}

export async function runTask(
  task: vscode.Task,
  client: GradleTasksClient,
  args = '',
  debug = false
): Promise<void> {
  if (isTaskRunning(task)) {
    return;
  }
  if (debug) {
    const INSTALL_EXTENSIONS = 'Install Missing Extensions';
    if (!getJavaLanguageSupportExtension() || !getJavaDebuggerExtension()) {
      const input = await vscode.window.showErrorMessage(
        'The Java Language Support & Debugger extensions are required for debugging.',
        INSTALL_EXTENSIONS
      );
      if (input === INSTALL_EXTENSIONS) {
        await vscode.commands.executeCommand(
          'workbench.extensions.action.showExtensionsWithIds',
          [JAVA_LANGUAGE_EXTENSION_ID, JAVA_DEBUGGER_EXTENSION_ID]
        );
      }
      return;
    } else if (!isJavaDebuggerExtensionActivated()) {
      vscode.window.showErrorMessage(
        'The Java Debugger extension is not activated.'
      );
      return;
    }
  }
  if (debug || args) {
    const debugTask = cloneTask(task, args, client, debug);
    vscode.tasks.executeTask(debugTask);
  } else {
    vscode.tasks.executeTask(task);
  }
}

export function queueRestartTask(
  client: GradleTasksClient,
  treeDataProvider: GradleTasksTreeDataProvider,
  task: vscode.Task
): void {
  if (isTaskRunning(task)) {
    restartingTasks.set(task.definition.id, task);
    // Once the task is cancelled it's restarted via onDidEndTask
    cancelTask(client, treeDataProvider, task);
  }
}

export async function runTaskWithArgs(
  task: vscode.Task,
  client: GradleTasksClient,
  debug = false
): Promise<void> {
  const args = await vscode.window.showInputBox({
    placeHolder: 'For example: --info',
    ignoreFocusOut: true,
  });
  if (args !== undefined) {
    runTask(task, client, args, debug);
  } else {
    logger.error('Args not supplied');
  }
}

function handleWorkspaceFoldersChange(): void {
  vscode.commands.executeCommand(COMMAND_REFRESH);
}

export function registerTaskProvider(
  context: vscode.ExtensionContext,
  client: GradleTasksClient
): GradleTaskProvider {
  const provider = new GradleTaskProvider(client);
  context.subscriptions.push(
    provider,
    vscode.tasks.registerTaskProvider('gradle', provider),
    vscode.workspace.onDidChangeWorkspaceFolders(handleWorkspaceFoldersChange),
    vscode.tasks.onDidEndTask((event: vscode.TaskEndEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        restartQueuedTask(task);
        vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
      }
    }),
    vscode.tasks.onDidStartTask((event: vscode.TaskEndEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
      }
    })
  );
  return provider;
}
