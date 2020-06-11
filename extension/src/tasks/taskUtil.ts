import * as vscode from 'vscode';
import { GradleTask, GradleProject, GradleBuild } from '../proto/gradle_pb';
import { TaskArgs } from '../stores/types';
import { Extension } from '../extension';
import { GradleTaskDefinition } from '.';
import { CustomBuildTaskTerminal } from '../terminal';
import { logger } from '../logger';
import { getGradleConfig, getConfigIsAutoDetectionEnabled } from '../config';
import { getGradleBuildFile } from '../util';
import {
  getJavaLanguageSupportExtension,
  getJavaDebuggerExtension,
  JAVA_LANGUAGE_EXTENSION_ID,
  JAVA_DEBUGGER_EXTENSION_ID,
  isJavaDebuggerExtensionActivated,
  isJavaLanguageSupportExtensionActivated,
} from '../compat';
import { getTaskArgs } from '../input';
import { COMMAND_RENDER_TASK } from '../commands';

const cancellingTasks: Map<string, vscode.Task> = new Map();
const restartingTasks: Map<string, vscode.Task> = new Map();

export function getTaskExecution(
  task: vscode.Task,
  args?: TaskArgs
): vscode.TaskExecution | undefined {
  return vscode.tasks.taskExecutions.find((e) => isTask(e.task, task, args));
}

function isTask(
  task1: vscode.Task,
  task2: vscode.Task,
  args?: TaskArgs
): boolean {
  const checkForArgs = args !== undefined;
  return (
    task1.definition.id === task2.definition.id &&
    (!checkForArgs || task1.definition.args === args)
  );
}

export function isGradleTask(task: vscode.Task): boolean {
  return task.definition.type === 'gradle';
}

export function getRunningGradleTasks(): vscode.Task[] {
  return vscode.tasks.taskExecutions
    .filter(({ task }) => isGradleTask(task))
    .map(({ task }) => task);
}

export function isTaskRunning(task: vscode.Task, args?: TaskArgs): boolean {
  return getTaskExecution(task, args) !== undefined;
}

export async function cancelTask(task: vscode.Task): Promise<void> {
  if (isTaskRunning(task)) {
    cancellingTasks.set(task.definition.id, task);
    await vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
    Extension.getInstance().getClient().cancelRunTask(task);
  }
}

export function isTaskCancelling(task: vscode.Task, args?: TaskArgs): boolean {
  const cancellingTask = getCancellingTask(task);
  const checkForArgs = args !== undefined;
  return Boolean(
    cancellingTask && (!checkForArgs || cancellingTask.definition.args === args)
  );
}

export function isTaskRestarting(task: vscode.Task, args?: TaskArgs): boolean {
  const restartingTask = getRestartingTask(task);
  const checkForArgs = args !== undefined;
  return Boolean(
    restartingTask && (!checkForArgs || restartingTask.definition.args === args)
  );
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

export async function restartQueuedTask(task: vscode.Task): Promise<void> {
  const restartingTask = getRestartingTask(task);
  if (restartingTask) {
    restartingTasks.delete(restartingTask.definition.id);
    try {
      await vscode.tasks.executeTask(restartingTask);
    } catch (e) {
      logger.error('There was an error starting the task:', e.message);
    }
  }
}

export async function removeCancellingTask(task: vscode.Task): Promise<void> {
  const cancellingTask = getCancellingTask(task);
  if (cancellingTask) {
    cancellingTasks.delete(cancellingTask.definition.id);
    await vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
  }
}

export function queueRestartTask(task: vscode.Task): void {
  if (isTaskRunning(task)) {
    restartingTasks.set(task.definition.id, task);
    // Once the task is cancelled it will restart via onDidEndTask
    cancelTask(task);
  }
}

export function buildTaskId(
  projectFolder: string,
  script: string,
  project: string
): string {
  return projectFolder + script + project;
}

export function buildTaskName(definition: GradleTaskDefinition): string {
  const argsLabel = definition.args ? ` ${definition.args}` : '';
  return `${definition.script}${argsLabel}`;
}

export function createTaskFromDefinition(
  definition: Required<GradleTaskDefinition>,
  workspaceFolder: vscode.WorkspaceFolder,
  projectFolder: vscode.Uri
): vscode.Task {
  const taskTerminalsStore = Extension.getInstance().getTaskTerminalsStore();
  const terminal = new CustomBuildTaskTerminal(
    workspaceFolder,
    projectFolder.fsPath
  );
  const task = new vscode.Task(
    definition,
    workspaceFolder,
    buildTaskName(definition),
    'gradle',
    new vscode.CustomExecution(
      async (): Promise<vscode.Pseudoterminal> => {
        const disposable = vscode.window.onDidOpenTerminal(
          (openedTerminal: vscode.Terminal) => {
            disposable.dispose();
            taskTerminalsStore.addEntry(
              definition.id + definition.args,
              openedTerminal
            );
          }
        );
        return terminal;
      }
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
  const definition: Required<GradleTaskDefinition> = {
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
  return createTaskFromDefinition(definition, workspaceFolder, projectFolder);
}

function getVSCodeTasksFromGradleProject(
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
        workspaceFolder,
        projectFolder,
        project
      )
    );
  });
  return vsCodeTasks;
}

async function getGradleBuild(
  projectFolder: vscode.WorkspaceFolder
): Promise<GradleBuild | void> {
  return Extension.getInstance()
    .getClient()
    .getBuild(projectFolder.uri.fsPath, getGradleConfig());
}

export async function loadTasksForFolders(
  folders: readonly vscode.WorkspaceFolder[]
): Promise<vscode.Task[]> {
  const allTasks: vscode.Task[] = [];
  for (const workspaceFolder of folders) {
    if (getConfigIsAutoDetectionEnabled(workspaceFolder)) {
      const buildFile = getGradleBuildFile(workspaceFolder);
      if (!buildFile) {
        continue;
      }
      const gradleBuild = await getGradleBuild(workspaceFolder);
      const gradleProject = gradleBuild && gradleBuild.getProject();
      if (gradleProject) {
        allTasks.push(
          ...getVSCodeTasksFromGradleProject(
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

export async function runTask(
  task: vscode.Task,
  args = '',
  debug = false
): Promise<void> {
  if (isTaskRunning(task, args)) {
    logger.warning('Unable to run task, task is already running:', task.name);
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
    } else if (!isJavaLanguageSupportExtensionActivated()) {
      vscode.window.showErrorMessage(
        'The Java Language Support extension is not activated.'
      );
      return;
    }
  }
  try {
    if (debug || args) {
      const debugTask = cloneTask(task, args, debug);
      await vscode.tasks.executeTask(debugTask);
    } else {
      await vscode.tasks.executeTask(task);
    }
  } catch (e) {
    logger.error('There was an error starting the task:', e.message);
  }
}

export async function runTaskWithArgs(
  task: vscode.Task,
  debug = false
): Promise<void> {
  const args = await getTaskArgs();
  if (args !== undefined) {
    runTask(task, args, debug);
  } else {
    logger.error('Args not supplied');
  }
}

export function cloneTask(
  task: vscode.Task,
  args: string,
  javaDebug = false
): vscode.Task {
  const folder = task.scope as vscode.WorkspaceFolder;
  const definition: Required<GradleTaskDefinition> = {
    ...(task.definition as GradleTaskDefinition),
    args,
    javaDebug,
  };
  return createTaskFromDefinition(
    definition,
    folder,
    vscode.Uri.file(definition.projectFolder)
  );
}
