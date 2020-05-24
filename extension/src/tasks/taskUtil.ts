import * as vscode from 'vscode';
import { GradleTaskDefinition } from './GradleTaskDefinition';
import { CustomBuildTaskTerminal } from './CustomBuildTaskTerminal';
import {
  GradleTask,
  GradleProject,
  GradleBuild,
} from '../proto/gradle_tasks_pb';
import { logger } from '../logger';
import { COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION } from '../commands';
import { getGradleConfig, getConfigIsAutoDetectionEnabled } from '../config';
import {
  getJavaLanguageSupportExtension,
  getJavaDebuggerExtension,
  JAVA_LANGUAGE_EXTENSION_ID,
  JAVA_DEBUGGER_EXTENSION_ID,
  isJavaDebuggerExtensionActivated,
} from '../compat';
import { SERVER_TASK_NAME } from '../server/serverUtil';
import { getGradleBuildFile } from '../util';
import { GradleTasksClient } from '../client/GradleTasksClient';
import { GradleTasksTreeDataProvider } from '../views/GradleTasksTreeDataProvider';

const cancellingTasks: Map<string, vscode.Task> = new Map();
const restartingTasks: Map<string, vscode.Task> = new Map();

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

function buildTaskId(
  projectFolder: string,
  script: string,
  project: string
): string {
  return projectFolder + script + project;
}

export function createTaskFromDefinition(
  definition: GradleTaskDefinition,
  workspaceFolder: vscode.WorkspaceFolder,
  projectFolder: vscode.Uri,
  client: GradleTasksClient
): vscode.Task {
  const terminal = new CustomBuildTaskTerminal(
    workspaceFolder,
    client,
    projectFolder.fsPath
  );
  const task = new vscode.Task(
    definition,
    workspaceFolder,
    definition.script,
    'gradle',
    new vscode.CustomExecution(
      async (): Promise<vscode.Pseudoterminal> => terminal
    ),
    ['$gradle']
  );
  task.presentationOptions = {
    showReuseMessage: false,
    clear: true,
    echo: true,
    focus: true,
    panel: vscode.TaskPanelKind.Shared,
    reveal: vscode.TaskRevealKind.Always,
  };
  terminal.setTask(task);
  return task;
}

function createVSCodeTaskFromGradleTask(
  client: GradleTasksClient,
  gradleTask: GradleTask,
  workspaceFolder: vscode.WorkspaceFolder,
  rootProject: string,
  buildFile: string,
  projectFolder: vscode.Uri,
  args = '',
  javaDebug = false
): vscode.Task {
  const taskPath = gradleTask.getPath();
  const script = taskPath[0] === ':' ? taskPath.substr(1) : taskPath;
  const definition: GradleTaskDefinition = {
    type: 'gradle',
    id: buildTaskId(projectFolder.fsPath, script, gradleTask.getProject()),
    script,
    description: gradleTask.getDescription(),
    group: (gradleTask.getGroup() || 'other').toLowerCase(),
    project: gradleTask.getProject(),
    buildFile: buildFile,
    rootProject,
    projectFolder: projectFolder.fsPath,
    workspaceFolder: workspaceFolder.uri.fsPath,
    args,
    javaDebug,
  };
  return createTaskFromDefinition(
    definition,
    workspaceFolder,
    projectFolder,
    client
  );
}

function getVSCodeTasksFromGradleProject(
  client: GradleTasksClient,
  workspaceFolder: vscode.WorkspaceFolder,
  projectFolder: vscode.Uri,
  gradleProject: GradleProject
): vscode.Task[] {
  const gradleTasks: GradleTask[] | void = gradleProject.getTasksList();
  const vsCodeTasks = [];
  try {
    vsCodeTasks.push(
      ...gradleTasks.map((gradleTask) =>
        createVSCodeTaskFromGradleTask(
          client,
          gradleTask,
          workspaceFolder,
          gradleTask.getRootproject(),
          gradleTask.getBuildfile(),
          projectFolder
        )
      )
    );
  } catch (err) {
    logger.error(
      'Unable to generate vscode tasks from gradle tasks:',
      err.message
    );
  }
  gradleProject.getProjectsList().forEach((project) => {
    vsCodeTasks.push(
      ...getVSCodeTasksFromGradleProject(
        client,
        workspaceFolder,
        projectFolder,
        project
      )
    );
  });
  return vsCodeTasks;
}

async function getGradleBuild(
  client: GradleTasksClient,
  projectFolder: vscode.WorkspaceFolder,
  buildFile: vscode.Uri
): Promise<GradleBuild | void> {
  const build = await client?.getBuild(
    projectFolder.uri.fsPath,
    getGradleConfig()
  );
  vscode.commands.executeCommand(
    COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION,
    buildFile
  );
  return build;
}

export async function loadTasksForFolders(
  client: GradleTasksClient,
  folders: readonly vscode.WorkspaceFolder[]
): Promise<vscode.Task[]> {
  const allTasks: vscode.Task[] = [];
  for (const workspaceFolder of folders) {
    if (getConfigIsAutoDetectionEnabled(workspaceFolder)) {
      const buildFile = getGradleBuildFile(workspaceFolder);
      if (!buildFile) {
        continue;
      }
      const gradleBuild = await getGradleBuild(
        client,
        workspaceFolder,
        vscode.Uri.file(buildFile)
      );
      const gradleProject = gradleBuild && gradleBuild.getProject();
      if (gradleProject) {
        allTasks.push(
          ...getVSCodeTasksFromGradleProject(
            client,
            workspaceFolder,
            workspaceFolder.uri,
            gradleProject
          )
        );
      }
    }
  }
  return allTasks;
}

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

export function isTaskRunning(task: vscode.Task): boolean {
  return getTaskExecution(task) !== undefined;
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

function cloneTask(
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
