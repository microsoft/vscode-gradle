import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as getPort from 'get-port';
import * as fg from 'fast-glob';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const stripAnsi = require('strip-ansi');

import {
  getConfigIsAutoDetectionEnabled,
  getConfigJavaHome,
  ConfigTaskPresentationOptionsRevealKind,
  ConfigTaskPresentationOptionsPanelKind,
  ConfigTaskPresentationOptions,
  getConfigTaskPresentationOptions,
  getGradleConfig,
} from './config';
import { logger } from './logger';
import { GradleTasksClient } from './client';
import { isTest, waitOnTcp } from './util';
import {
  Output,
  GradleProject,
  GradleTask,
  GradleBuild,
} from './proto/gradle_tasks_pb';
import { SERVER_TASK_NAME } from './server';
import { hasBuildFile } from './gradleView';

const localize = nls.loadMessageBundle();

export interface GradleTaskDefinition extends vscode.TaskDefinition {
  id: string;
  script: string;
  description: string;
  group: string;
  project: string;
  rootProject: string;
  buildFile: string;
  projectFolder: string;
  workspaceFolder: string;
  args: string;
  javaDebug: boolean;
}

const cancellingTasks: Map<string, vscode.Task> = new Map();
const restartingTasks: Map<string, vscode.Task> = new Map();
let cachedTasks: vscode.Task[] = [];
const emptyTasks: vscode.Task[] = [];

export function getTaskExecution(
  task: vscode.Task
): vscode.TaskExecution | undefined {
  return vscode.tasks.taskExecutions.find((e) => isTask(e.task, task));
}

export function generateTaskId(
  projectFolder: string,
  script: string,
  project: string
): string {
  return projectFolder + script + project;
}

export function getTaskId(task: vscode.Task): string {
  return generateTaskId(
    task.definition.projectFolder,
    task.definition.script,
    task.definition.project
  );
}

function isTask(task1: vscode.Task, task2: vscode.Task): boolean {
  return task1.definition.id === task2.definition.id;
}

export function isGradleTask(task: vscode.Task): boolean {
  return task.source === 'gradle' && task.name !== SERVER_TASK_NAME;
}

export function getRunningGradleTasks(): vscode.Task[] {
  return vscode.tasks.taskExecutions
    .filter(({ task }) => isGradleTask(task))
    .map(({ task }) => task);
}

export function cancelRunningGradleTasks(): void {
  const tasks = getRunningGradleTasks();
  tasks.forEach((task) =>
    vscode.commands.executeCommand('gradle.cancelTask', task)
  );
}

export function cancelTask(task: vscode.Task): void {
  const execution = getTaskExecution(task);
  if (execution) {
    execution.terminate();
    cancellingTasks.set(task.definition.id, task);
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

function getGradleBuildFile(folder: vscode.WorkspaceFolder): string {
  const files = fg.sync('!(*settings){.gradle,.gradle.kts}', {
    onlyFiles: true,
    cwd: folder.uri.fsPath,
    deep: 1,
    absolute: true,
  });
  return files[0];
}

function getTaskPresentationOptions(): vscode.TaskPresentationOptions {
  const configTaskPresentationOptions: ConfigTaskPresentationOptions = getConfigTaskPresentationOptions();
  return {
    ...configTaskPresentationOptions,
    ...{
      panel: getTaskPanelKind(configTaskPresentationOptions.panel),
      reveal: getTaskRevealKind(configTaskPresentationOptions.reveal),
    },
  };
}

type callback = () => void;

export class GradleTaskProvider
  implements vscode.TaskProvider, vscode.Disposable {
  private _onTasksLoaded: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  private waitForLoadedCallbacks: callback[] = [];
  private hasLoaded = false;
  private readonly onTasksLoaded: vscode.Event<null> = this._onTasksLoaded
    .event;

  constructor(private readonly client: GradleTasksClient) {
    this.onTasksLoaded(() => {
      if (!this.hasLoaded) {
        this.callWaitForLoadedCallbacks();
        this.hasLoaded = true;
      } else {
        this._onTasksLoaded.dispose();
      }
    });
  }

  async provideTasks(): Promise<vscode.Task[] | undefined> {
    return cachedTasks;
  }

  public waitForLoaded(callback: callback): void {
    this.waitForLoadedCallbacks.push(callback);
    if (this.hasLoaded) {
      this.callWaitForLoadedCallbacks();
    }
  }

  private callWaitForLoadedCallbacks(): void {
    this.waitForLoadedCallbacks.forEach((callback) => callback());
    this.waitForLoadedCallbacks.splice(0);
  }

  public dispose(): void {
    this._onTasksLoaded.dispose();
  }

  // TODO
  public async resolveTask(/*
      _task: vscode.Task
    */): Promise<
    vscode.Task | undefined
  > {
    return undefined;
  }

  private async refreshTasks(
    folders: readonly vscode.WorkspaceFolder[]
  ): Promise<vscode.Task[]> {
    const allTasks: vscode.Task[] = [];
    const taskPresentationOptions = getTaskPresentationOptions();
    for (const workspaceFolder of folders) {
      if (getConfigIsAutoDetectionEnabled(workspaceFolder)) {
        const buildFile = getGradleBuildFile(workspaceFolder);
        if (!buildFile) {
          continue;
        }
        const gradleBuild = await this.getGradleBuild(
          workspaceFolder,
          vscode.Uri.file(buildFile)
        );
        const gradleProject = gradleBuild && gradleBuild.getProject();
        if (gradleProject) {
          allTasks.push(
            ...this.getVSCodeTasksFromGradleProject(
              workspaceFolder,
              workspaceFolder.uri,
              gradleProject,
              taskPresentationOptions
            )
          );
        }
      }
    }
    return allTasks;
  }

  public async refresh(): Promise<vscode.Task[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      cachedTasks = emptyTasks;
    } else {
      try {
        cachedTasks = await this.refreshTasks(folders);
        logger.info(
          localize('tasks.foundAmount', 'Found {0} tasks', cachedTasks.length)
        );
      } catch (err) {
        localize(
          'tasks.refreshError',
          'Unable to refresh tasks: {0}',
          err.message
        );
        cachedTasks = emptyTasks;
      }
    }
    this._onTasksLoaded.fire();
    return cachedTasks;
  }

  public getTasks(): vscode.Task[] {
    return cachedTasks;
  }

  private async getGradleBuild(
    projectFolder: vscode.WorkspaceFolder,
    buildFile: vscode.Uri
  ): Promise<GradleBuild | void> {
    const build = await this.client?.getBuild(
      projectFolder.uri.fsPath,
      getGradleConfig()
    );
    vscode.commands.executeCommand(
      'gradle.updateJavaProjectConfiguration',
      buildFile
    );
    return build;
  }

  private getVSCodeTasksFromGradleProject(
    workspaceFolder: vscode.WorkspaceFolder,
    projectFolder: vscode.Uri,
    gradleProject: GradleProject,
    presentationOptions: vscode.TaskPresentationOptions
  ): vscode.Task[] {
    const gradleTasks: GradleTask[] | void = gradleProject.getTasksList();
    const vsCodeTasks = [];
    try {
      vsCodeTasks.push(
        ...gradleTasks.map((gradleTask) =>
          this.createVSCodeTaskFromGradleTask(
            gradleTask,
            workspaceFolder,
            gradleTask.getRootproject(),
            gradleTask.getBuildfile(),
            projectFolder,
            presentationOptions
          )
        )
      );
    } catch (err) {
      logger.error(
        localize(
          'tasks.vsCodeTaskGenerateError',
          'Unable to generate vscode tasks from gradle tasks: {0}',
          err.message
        )
      );
    }
    gradleProject.getProjectsList().forEach((project) => {
      vsCodeTasks.push(
        ...this.getVSCodeTasksFromGradleProject(
          workspaceFolder,
          projectFolder,
          project,
          presentationOptions
        )
      );
    });
    return vsCodeTasks;
  }

  private createVSCodeTaskFromGradleTask(
    gradleTask: GradleTask,
    workspaceFolder: vscode.WorkspaceFolder,
    rootProject: string,
    buildFile: string,
    projectFolder: vscode.Uri,
    presentationOptions: vscode.TaskPresentationOptions,
    args = '',
    javaDebug = false
  ): vscode.Task {
    const taskPath = gradleTask.getPath();
    // Fastest op, tested with jsperf
    const script = taskPath[0] === ':' ? taskPath.substr(1) : taskPath;
    const definition: GradleTaskDefinition = {
      type: 'gradle',
      id: generateTaskId(projectFolder.fsPath, script, gradleTask.getProject()),
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
      this.client,
      presentationOptions
    );
  }
}

export function invalidateTasksCache(): void {
  cachedTasks = emptyTasks;
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

function isTaskOfType(definition: GradleTaskDefinition, type: string): boolean {
  return definition.group.toLowerCase() === type;
}

class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  public onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private closeEmitter = new vscode.EventEmitter<void>();
  onDidClose?: vscode.Event<void> = this.closeEmitter.event;

  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly client: GradleTasksClient,
    private readonly projectFolder: string,
    private readonly task: vscode.Task
  ) {}

  open(): void {
    this.doBuild();
  }

  close(): void {
    if (isTaskRunning(this.task)) {
      this.client.cancelRunTask(this.task);
    }
  }

  private handleOutput(message: string): void {
    const logMessage = message.trim();
    if (logMessage) {
      this.write(logMessage);
      // This allows us to test process stdout via the logger
      if (isTest()) {
        logger.info(stripAnsi(logMessage));
      }
    }
  }

  private write(message: string): void {
    this.writeEmitter.fire(message + '\r\n');
  }

  private async startJavaDebug(javaDebugPort: number): Promise<void> {
    try {
      await waitOnTcp('localhost', javaDebugPort);
      const startedDebugging = await vscode.debug.startDebugging(
        this.workspaceFolder,
        {
          type: 'java',
          name: 'Debug (Attach) via Gradle Tasks',
          request: 'attach',
          hostName: 'localhost',
          port: javaDebugPort,
        }
      );
      if (!startedDebugging) {
        throw new Error(
          localize(
            'tasks.debuggerNotStartedError',
            'The debugger was not started'
          )
        );
      }
    } catch (err) {
      logger.error(
        localize(
          'tasks.debugError',
          'Unable to start Java debugging: {0}',
          err.message
        )
      );
      this.close();
    }
  }

  private async doBuild(): Promise<void> {
    const args: string[] = this.task.definition.args.split(' ').filter(Boolean);
    try {
      const javaDebugEnabled = this.task.definition.javaDebug;
      const javaDebugPort = javaDebugEnabled ? await getPort() : null;
      const runTask = this.client.runTask(
        this.projectFolder,
        this.task,
        args,
        javaDebugPort,
        (output: Output): void => {
          this.handleOutput(output.getMessage().trim());
        }
      );
      if (javaDebugEnabled) {
        await this.startJavaDebug(javaDebugPort!);
      }
      await runTask;
      vscode.commands.executeCommand(
        'gradle.updateJavaProjectConfiguration',
        vscode.Uri.file(this.task.definition.buildFile)
      );
    } finally {
      setTimeout(() => {
        this.closeEmitter.fire();
      }, 100); // give the UI some time to render the terminal
    }
  }

  handleInput(data: string): void {
    if (data === '\x03') {
      vscode.commands.executeCommand('gradle.cancelTask', this.task);
    }
  }
}

function getTaskPanelKind(
  panel: ConfigTaskPresentationOptionsPanelKind
): vscode.TaskPanelKind {
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore
  return vscode.TaskPanelKind[panel[0].toUpperCase() + panel.substr(1)];
}

function getTaskRevealKind(
  reveal: ConfigTaskPresentationOptionsRevealKind
): vscode.TaskRevealKind {
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore
  return vscode.TaskRevealKind[reveal[0].toUpperCase() + reveal.substr(1)];
}

export function createTaskFromDefinition(
  definition: GradleTaskDefinition,
  workspaceFolder: vscode.WorkspaceFolder,
  projectFolder: vscode.Uri,
  client: GradleTasksClient,
  presentationOptions: vscode.TaskPresentationOptions
): vscode.Task {
  const task = new vscode.Task(
    definition,
    workspaceFolder,
    definition.script,
    'gradle',
    new vscode.CustomExecution(
      async (): Promise<vscode.Pseudoterminal> => {
        return new CustomBuildTaskTerminal(
          workspaceFolder,
          client,
          projectFolder.fsPath,
          task
        );
      }
    ),
    ['$gradle']
  );
  task.presentationOptions = presentationOptions;
  if (isTaskOfType(definition, 'build')) {
    task.group = vscode.TaskGroup.Build;
  }
  if (isTaskOfType(definition, 'test')) {
    task.group = vscode.TaskGroup.Test;
  }
  return task;
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
    client,
    task.presentationOptions
  );
}

export function buildGradleServerTask(
  taskName: string,
  cwd: string,
  args: string[] = []
): vscode.Task {
  const cmd = `"${getGradleTasksServerCommand()}"`;
  logger.debug(`Gradle Tasks Server dir: ${cwd}`);
  logger.debug(`Gradle Tasks Server cmd: ${cmd} ${args}`);
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
  const task = new vscode.Task(
    definition,
    vscode.TaskScope.Workspace,
    taskName,
    taskType,
    new vscode.ShellExecution(cmd, args, { cwd, env })
  );
  // task.isBackground = true; // this hides errors on task start
  task.source = taskType;
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Never,
    focus: false,
    echo: true,
    clear: false,
    panel: vscode.TaskPanelKind.Shared,
  };
  return task;
}

export async function handleCancelledTask(task: vscode.Task): Promise<void> {
  const cancellingTask = getCancellingTask(task);
  if (cancellingTask) {
    cancellingTasks.delete(cancellingTask.definition.id);
  }
  const restartingTask = getRestartingTask(task);
  if (restartingTask) {
    vscode.tasks.executeTask(restartingTask);
    restartingTasks.delete(restartingTask.definition.id);
  }
  vscode.commands.executeCommand('gradle.renderTask', task);
}

export function runTask(
  task: vscode.Task,
  client: GradleTasksClient,
  debug = false
): void {
  if (!isTaskRunning(task)) {
    if (debug) {
      const debugTask = cloneTask(task, '', client, true);
      vscode.tasks.executeTask(debugTask);
    } else {
      vscode.tasks.executeTask(task);
    }
  }
}

export function restartTask(task: vscode.Task): void {
  if (isTaskRunning(task)) {
    restartingTasks.set(task.definition.id, task);
    cancelTask(task); // after it's cancelled, it will restart
  }
}

export async function runTaskWithArgs(
  task: vscode.Task,
  client: GradleTasksClient,
  debug = false
): Promise<void> {
  const args = await vscode.window.showInputBox({
    placeHolder: localize(
      'tasks.runTaskWithArgsExample',
      'For example: {0}',
      '--all'
    ),
    ignoreFocusOut: true,
  });
  if (args !== undefined) {
    const taskWithArgs = cloneTask(task, args, client);
    if (taskWithArgs) {
      runTask(taskWithArgs, client, debug);
    }
  }
}

export function registerTaskProvider(
  context: vscode.ExtensionContext,
  client: GradleTasksClient
): GradleTaskProvider {
  function handleBuildFileChange(uri: vscode.Uri): void {
    // Ignore any nested build files outside of the multi-project builds
    // TODO: Maybe we only ignore if a task/build is running?
    if (hasBuildFile(uri.fsPath)) {
      vscode.commands.executeCommand('gradle.refresh');
    }
  }
  function handleWorkspaceFoldersChange(): void {
    vscode.commands.executeCommand('gradle.refresh');
  }
  const buildFileGlob = `**/*.{gradle,gradle.kts}`;
  const watcher = vscode.workspace.createFileSystemWatcher(buildFileGlob);
  context.subscriptions.push(watcher);
  watcher.onDidChange(handleBuildFileChange);
  watcher.onDidDelete(handleBuildFileChange);
  watcher.onDidCreate(handleBuildFileChange);
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(handleWorkspaceFoldersChange)
  );
  const provider = new GradleTaskProvider(client);
  const taskProvider = vscode.tasks.registerTaskProvider('gradle', provider);
  context.subscriptions.push(taskProvider);
  return provider;
}
