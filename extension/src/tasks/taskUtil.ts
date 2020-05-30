import * as vscode from 'vscode';
import { GradleTaskDefinition } from './GradleTaskDefinition';
import { CustomBuildTaskTerminal } from '../terminal/CustomBuildTaskTerminal';
import { GradleTask, GradleProject, GradleBuild } from '../proto/gradle_pb';
import { logger } from '../logger';
import { getGradleConfig, getConfigIsAutoDetectionEnabled } from '../config';
import {
  getJavaLanguageSupportExtension,
  getJavaDebuggerExtension,
  JAVA_LANGUAGE_EXTENSION_ID,
  JAVA_DEBUGGER_EXTENSION_ID,
  isJavaDebuggerExtensionActivated,
} from '../compat';
import { getGradleBuildFile } from '../util';
import { GradleClient } from '../client/GradleClient';
import {
  COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION,
  COMMAND_RENDER_TASK,
} from '../commands/constants';
import { getTaskArgs } from '../input';
import { TaskArgs } from '../stores/types';
// import { TaskTerminalsStore } from '../stores/TaskTerminalsStore';

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

export function cancelTask(task: vscode.Task): void {
  if (isTaskRunning(task)) {
    cancellingTasks.set(task.definition.id, task);
    vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
    GradleClient.getInstance().cancelRunTask(task);
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

export function queueRestartTask(task: vscode.Task): void {
  if (isTaskRunning(task)) {
    restartingTasks.set(task.definition.id, task);
    // Once the task is cancelled it's restarted via onDidEndTask
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

export function createTaskFromDefinition(
  definition: GradleTaskDefinition,
  workspaceFolder: vscode.WorkspaceFolder,
  projectFolder: vscode.Uri
  // taskTerminalsStore: TaskTerminalsStore
): vscode.Task {
  const terminal = new CustomBuildTaskTerminal(
    workspaceFolder,
    projectFolder.fsPath
  );
  const argsLabel = definition.args ? ` ${definition.args}` : '';
  const taskName = `${definition.script}${argsLabel}`;
  const task = new vscode.Task(
    definition,
    workspaceFolder,
    taskName,
    'gradle',
    new vscode.CustomExecution(
      async (): Promise<vscode.Pseudoterminal> => {
        // const disposable = vscode.window.onDidOpenTerminal(
        //   (openedTerminal: vscode.Terminal) => {
        //     disposable.dispose();
        //     taskTerminalsStore.add(definition.id, {
        //       terminal: openedTerminal,
        //       definition,
        //     });
        //   }
        // );
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
  // taskTerminalsStore: TaskTerminalsStore,
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
  return createTaskFromDefinition(
    definition,
    workspaceFolder,
    projectFolder
    // taskTerminalsStore
  );
}

function getVSCodeTasksFromGradleProject(
  // taskTerminalsStore: TaskTerminalsStore,
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
          // taskTerminalsStore,
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
        // taskTerminalsStore,
        workspaceFolder,
        projectFolder,
        project
      )
    );
  });
  return vsCodeTasks;
}

async function getGradleBuild(
  projectFolder: vscode.WorkspaceFolder,
  buildFile: vscode.Uri
): Promise<GradleBuild | void> {
  const build = await GradleClient.getInstance().getBuild(
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
  // taskTerminalsStore: TaskTerminalsStore,
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
        workspaceFolder,
        vscode.Uri.file(buildFile)
      );
      const gradleProject = gradleBuild && gradleBuild.getProject();
      if (gradleProject) {
        allTasks.push(
          ...getVSCodeTasksFromGradleProject(
            // taskTerminalsStore,
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
  // taskTerminalsStore: TaskTerminalsStore,
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
    const debugTask = cloneTask(
      task,
      args,
      /*, taskTerminalsStore*/
      debug
    );
    vscode.tasks.executeTask(debugTask);
  } else {
    vscode.tasks.executeTask(task);
  }
}

export async function runTaskWithArgs(
  task: vscode.Task,
  // taskTerminalsStore: TaskTerminalsStore,
  debug = false
): Promise<void> {
  const args = await getTaskArgs();
  if (args !== undefined) {
    runTask(task /*, taskTerminalsStore*/, args, debug);
  } else {
    logger.error('Args not supplied');
  }
}

export function cloneTask(
  task: vscode.Task,
  args: string,
  // taskTerminalsStore: TaskTerminalsStore,
  javaDebug = false
): vscode.Task {
  const folder = task.scope as vscode.WorkspaceFolder;
  const definition: GradleTaskDefinition = {
    ...(task.definition as GradleTaskDefinition),
    args,
    javaDebug,
  };
  return createTaskFromDefinition(
    definition,
    folder,
    vscode.Uri.file(definition.projectFolder)
    // taskTerminalsStore
  );
}
