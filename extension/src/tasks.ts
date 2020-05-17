import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as getPort from 'get-port';
import * as fg from 'fast-glob';
import * as util from 'util';

import {
  getConfigIsAutoDetectionEnabled,
  getConfigJavaHome,
  getGradleConfig,
} from './config';
import { logger } from './logger';
import { GradleTasksClient } from './client';
import { waitOnTcp, isTest } from './util';
import {
  Output,
  GradleProject,
  GradleTask,
  GradleBuild,
} from './proto/gradle_tasks_pb';
import { SERVER_TASK_NAME } from './server';
import { GradleTasksTreeDataProvider } from './gradleView';
import {
  getJavaLanguageSupportExtension,
  getJavaDebuggerExtension,
  JAVA_LANGUAGE_EXTENSION_ID,
  JAVA_DEBUGGER_EXTENSION_ID,
  isJavaDebuggerExtensionActivated,
} from './compat';
import { LoggerStream } from './LoggerSteam';

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
const emptyTasks: vscode.Task[] = [];
let cachedTasks: vscode.Task[] = [];

export function getTaskExecution(
  task: vscode.Task
): vscode.TaskExecution | undefined {
  return vscode.tasks.taskExecutions.find((e) => isTask(e.task, task));
}

export function buildTaskId(
  projectFolder: string,
  script: string,
  project: string
): string {
  return projectFolder + script + project;
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

function getGradleBuildFile(folder: vscode.WorkspaceFolder): string {
  const files = fg.sync('!(*settings){.gradle,.gradle.kts}', {
    onlyFiles: true,
    cwd: folder.uri.fsPath,
    deep: 1,
    absolute: true,
  });
  return files[0];
}

type callback = () => void;

export class GradleTaskProvider
  implements vscode.TaskProvider, vscode.Disposable {
  private _onTasksLoaded: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  private _onDidRefreshStart: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private _onDidRefreshStop: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private waitForLoadedCallbacks: callback[] = [];
  private hasLoaded = false;
  private readonly onTasksLoaded: vscode.Event<null> = this._onTasksLoaded
    .event;
  public onDidRefreshStart: vscode.Event<null> = this._onDidRefreshStart.event;
  public onDidRefreshStop: vscode.Event<null> = this._onDidRefreshStop.event;

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
    this._onDidRefreshStart.dispose();
    this._onDidRefreshStop.dispose();
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
              gradleProject
            )
          );
        }
      }
    }
    return allTasks;
  }

  public async refresh(): Promise<vscode.Task[]> {
    logger.debug('Refreshing tasks');
    this._onDidRefreshStart.fire(null);
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
    this._onTasksLoaded.fire(null);
    this._onDidRefreshStop.fire(null);
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
    gradleProject: GradleProject
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
            projectFolder
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
          project
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
      this.client
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

class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  public onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private closeEmitter = new vscode.EventEmitter<void>();
  private task?: vscode.Task;
  onDidClose?: vscode.Event<void> = this.closeEmitter.event;

  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly client: GradleTasksClient,
    private readonly projectFolder: string
  ) {}

  public setTask(task: vscode.Task): void {
    this.task = task;
  }

  open(): void {
    this.doBuild();
  }

  close(): void {
    if (this.task && isTaskRunning(this.task)) {
      vscode.commands.executeCommand('gradle.cancelTask');
    }
  }

  private handleOutput(messageBytes: Uint8Array): void {
    const NL = '\n';
    const CR = '\r';
    if (messageBytes.length) {
      const string = new util.TextDecoder('utf-8')
        .decode(messageBytes)
        .split('')
        .map((char: string) => {
          // Note writing `\n` will just move the cursor down 1 row.
          // We need to write `\r` as well to move the cursor to the left-most cell.
          return char === NL ? NL + CR : char;
        })
        .join('');
      this.write(string);
    }
  }

  private write(message: string): void {
    this.writeEmitter.fire(message);
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
    const stdOutLoggerStream = new LoggerStream(logger, 'info');
    const args: string[] = this.task!.definition.args.split(' ').filter(
      Boolean
    );
    try {
      const javaDebugEnabled = this.task!.definition.javaDebug;
      const javaDebugPort = javaDebugEnabled ? await getPort() : 0;
      const runTask = this.client.runTask(
        this.projectFolder,
        this.task!,
        args,
        '',
        javaDebugPort,
        (output: Output): void => {
          this.handleOutput(output.getOutputBytes_asU8());
          if (isTest()) {
            stdOutLoggerStream.write(output.getOutputBytes_asU8());
          }
        },
        true
      );
      if (javaDebugEnabled) {
        await this.startJavaDebug(javaDebugPort!);
      }
      await runTask;
      vscode.commands.executeCommand(
        'gradle.updateJavaProjectConfiguration',
        vscode.Uri.file(this.task!.definition.buildFile)
      );
    } finally {
      this.closeEmitter.fire();
    }
  }

  handleInput(data: string): void {
    // sigint eg cmd/ctrl+C
    if (data === '\x03') {
      vscode.commands.executeCommand('gradle.cancelTask', this.task);
    }
  }
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
  const task = new vscode.Task(
    definition,
    vscode.TaskScope.Workspace,
    taskName,
    taskType,
    new vscode.ShellExecution(cmd, args, { cwd, env })
  );
  // task.isBackground = true; // this hides errors on task start
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Never,
    focus: false,
    echo: true,
    clear: false,
    panel: vscode.TaskPanelKind.Shared,
  };
  return task;
}

export function restartTask(task: vscode.Task): void {
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
    const INSTALL_EXTENSIONS = localize(
      'commands.requiredExtensionMissing',
      'Install Missing Extensions'
    );
    if (!getJavaLanguageSupportExtension() || !getJavaDebuggerExtension()) {
      const input = await vscode.window.showErrorMessage(
        localize(
          'commands.missingJavaLanguageSupportExtension',
          'The Java Language Support & Debugger extensions are required for debugging.'
        ),
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
        localize(
          'commands.javaDebuggerExtensionNotActivated',
          'The Java Debugger extension is not activated.'
        )
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
    placeHolder: localize(
      'tasks.runTaskWithArgsExample',
      'For example: {0}',
      '--info'
    ),
    ignoreFocusOut: true,
  });
  if (args !== undefined) {
    runTask(task, client, args, debug);
  } else {
    logger.error('Args not supplied');
  }
}

export function registerTaskProvider(
  context: vscode.ExtensionContext,
  client: GradleTasksClient
): GradleTaskProvider {
  function handleWorkspaceFoldersChange(): void {
    vscode.commands.executeCommand('gradle.refresh');
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(handleWorkspaceFoldersChange)
  );
  const provider = new GradleTaskProvider(client);
  const taskProvider = vscode.tasks.registerTaskProvider('gradle', provider);

  context.subscriptions.push(taskProvider);

  context.subscriptions.push(
    vscode.tasks.onDidEndTask((event: vscode.TaskEndEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        restartTask(task);
      }
    })
  );
  return provider;
}
