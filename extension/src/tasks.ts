import * as vscode from 'vscode';
import * as path from 'path';
import * as nls from 'vscode-nls';
import {
  getIsAutoDetectionEnabled,
  getTaskPresentationOptions,
  getJavaHome,
  ConfigTaskPresentationOptions,
  ConfigTaskPresentationOptionsRevealKind,
  ConfigTaskPresentationOptionsPanelKind,
} from './config';
import { logger } from './logger';
import { GradleTasksClient } from './client';
import {
  Output,
  GradleProject,
  GradleTask,
  Cancelled,
} from './proto/gradle_tasks_pb';

const localize = nls.loadMessageBundle();
const isTest = (): boolean => {
  return (process.env.VSCODE_TEST || '').toLowerCase() === 'true';
};

export interface GradleTaskDefinition extends vscode.TaskDefinition {
  script: string;
  description: string;
  group: string;
  project: string;
  parentProject: string;
  rootProject: string;
  buildFile: string;
  projectFolder: string;
  workspaceFolder: string;
  args: string;
}

const stoppingTasks: Set<vscode.Task> = new Set();
let autoDetectOverride = false;
let cachedTasks: vscode.Task[] = [];
const emptyTasks: vscode.Task[] = [];

export function enableTaskDetection(): void {
  autoDetectOverride = true;
}

export function getTaskExecution(
  task: vscode.Task
): vscode.TaskExecution | undefined {
  return vscode.tasks.taskExecutions.find(
    (e) => JSON.stringify(e.task.definition) === JSON.stringify(task.definition)
  );
}

export function getGradleTaskExecutions(): vscode.TaskExecution[] {
  return vscode.tasks.taskExecutions.filter((e) => e.task.source === 'gradle');
}

export function stopRunningGradleTasks(): void {
  const taskExecutions = getGradleTaskExecutions();
  taskExecutions.forEach((execution) => {
    vscode.commands.executeCommand('gradle.stopTask', execution.task);
  });
}

export function stopTask(task: vscode.Task): void {
  const execution = getTaskExecution(task);
  if (execution) {
    execution.terminate();
    stoppingTasks.add(task);
  }
}

export function isTaskRunning(task: vscode.Task): boolean {
  return getTaskExecution(task) !== undefined;
}

export function isTaskStopping(task: vscode.Task): boolean {
  return stoppingTasks.has(task);
}

export function setStoppedTaskAsComplete(
  task: string,
  sourceDir: string
): void {
  const stoppingTask = Array.from(stoppingTasks).find(
    ({ definition }) =>
      definition.script === task && definition.projectFolder === sourceDir
  );
  if (stoppingTask) {
    stoppingTasks.delete(stoppingTask);
  }
}

async function hasGradleBuildFile(folder: vscode.Uri): Promise<boolean> {
  const relativePattern = new vscode.RelativePattern(
    folder.fsPath,
    '*{.gradle,.gradle.kts}'
  );
  const files = await vscode.workspace.findFiles(relativePattern);
  return files.length > 0;
}

async function getGradleProjectFolders(
  rootWorkspaceFolder: vscode.WorkspaceFolder
): Promise<vscode.Uri[]> {
  const gradleWrapperFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(rootWorkspaceFolder, '**/*{gradlew,gradlew.bat}')
  );
  const gradleWrapperFolders = Array.from(
    new Set(gradleWrapperFiles.map((file) => path.dirname(file.fsPath)))
  ).map((folder) => vscode.Uri.file(folder));
  const gradleProjectFolders: vscode.Uri[] = [];
  for (const gradleWrapperFolder of gradleWrapperFolders) {
    if (await hasGradleBuildFile(gradleWrapperFolder)) {
      gradleProjectFolders.push(gradleWrapperFolder);
    }
  }
  return gradleProjectFolders;
}

export class GradleTaskProvider implements vscode.TaskProvider {
  private refreshPromise: Promise<void> | undefined = undefined;

  constructor(private readonly client: GradleTasksClient) {}

  async provideTasks(): Promise<vscode.Task[] | undefined> {
    return cachedTasks;
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
      if (autoDetectOverride || getIsAutoDetectionEnabled(workspaceFolder)) {
        let projectFolders: vscode.Uri[] = [];
        try {
          projectFolders = await getGradleProjectFolders(workspaceFolder);
        } catch (err) {
          logger.error(
            localize(
              'tasks.getGradleProjectsError',
              'Unable to get gradle project folders: {0}',
              err.message
            )
          );
        }
        for (const projectFolder of projectFolders) {
          // TODO
          // Can't we do this in parallel?
          const gradleProject = await this.getGradleProjectFromRootProjectFolder(
            projectFolder
          );
          if (gradleProject) {
            allTasks.push(
              ...this.getVSCodeTasksFromGradleProject(
                workspaceFolder,
                projectFolder,
                gradleProject
              )
            );
          }
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
      if (!this.refreshPromise) {
        // TODO: can't we just await here
        this.refreshPromise = this.refreshTasks(folders)
          .then(
            (tasks) => {
              cachedTasks = tasks;
            },
            (err) => {
              localize(
                'tasks.refreshError',
                'Unable to refresh tasks: {0}',
                err.message
              );
              cachedTasks = emptyTasks;
            }
          )
          .finally(() => {
            this.refreshPromise = undefined;
          });
      }
      await this.refreshPromise;
    }
    return cachedTasks;
  }

  private async getGradleProjectFromRootProjectFolder(
    projectFolder: vscode.Uri
  ): Promise<GradleProject | void> {
    try {
      return await this.client?.getProject(projectFolder.fsPath);
    } catch (err) {
      logger.error(
        localize(
          'tasks.errorRefreshingTasks',
          'Error providing gradle tasks: {0}',
          err.details || err.message
        )
      );
    }
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
            vscode.Uri.file(gradleTask.getBuildfile()),
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
    gradleProject.getSubProjectsList().forEach((subProject) => {
      vsCodeTasks.push(
        ...this.getVSCodeTasksFromGradleProject(
          workspaceFolder,
          projectFolder,
          subProject
        )
      );
    });
    return vsCodeTasks;
  }

  private createVSCodeTaskFromGradleTask(
    gradleTask: GradleTask,
    workspaceFolder: vscode.WorkspaceFolder,
    rootProject: string,
    buildFile: vscode.Uri,
    projectFolder: vscode.Uri,
    args = ''
  ): vscode.Task {
    const script = gradleTask.getPath().replace(/^:/, '');
    const definition: GradleTaskDefinition = {
      type: 'gradle',
      script,
      description: gradleTask.getDescription(),
      group: (gradleTask.getGroup() || 'other').toLowerCase(),
      project: gradleTask.getProject(),
      buildFile: buildFile.fsPath,
      rootProject,
      projectFolder: projectFolder.fsPath,
      parentProject: 'nothing for now',
      workspaceFolder: workspaceFolder.uri.fsPath,
      args,
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

function isTaskOfType(definition: GradleTaskDefinition, type: string): boolean {
  return (
    definition.group.toLowerCase() === type ||
    definition.script.split(' ')[0].split(':').pop() === type
  );
}

class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  public onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  private closeEmitter = new vscode.EventEmitter<void>();
  onDidClose?: vscode.Event<void> = this.closeEmitter.event;

  constructor(
    private readonly client: GradleTasksClient,
    private readonly sourceDir: string,
    private readonly task: vscode.Task
  ) {}

  open(): void {
    this.doBuild();
  }

  close(): void {
    this.client.cancelRunTask(this.sourceDir, this.task.definition.script);
  }

  private handleOutput(message: string): void {
    const logMessage = message.trim();
    if (logMessage) {
      this.writeEmitter.fire(message + '\r\n');
    }
    // This allows us to test process stdout via the logger
    if (isTest()) {
      logger.info(message);
    }
  }

  private async doBuild(): Promise<void> {
    const args = this.task.definition.args.split(' ').filter(Boolean);
    try {
      await this.client.runTask(
        this.sourceDir,
        this.task.definition.script,
        args,
        (output: Output): void => {
          this.handleOutput(output.getMessage());
        }
      );
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
      vscode.commands.executeCommand('gradle.stopTask', this.task);
    }
  }
}

function getTaskPanelKind(
  panel: ConfigTaskPresentationOptionsPanelKind
): vscode.TaskPanelKind {
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore
  return vscode.TaskPanelKind[panel[0].toUpperCase() + panel.substring(1)];
}

function getTaskRevealKind(
  reveal: ConfigTaskPresentationOptionsRevealKind
): vscode.TaskRevealKind {
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore
  return vscode.TaskRevealKind[reveal[0].toUpperCase() + reveal.substring(1)];
}

export function createTaskFromDefinition(
  definition: GradleTaskDefinition,
  workspaceFolder: vscode.WorkspaceFolder,
  projectFolder: vscode.Uri,
  client: GradleTasksClient
): vscode.Task {
  let taskName = definition.script;
  if (definition.projectFolder !== definition.workspaceFolder) {
    const relativePath = path.relative(
      definition.workspaceFolder,
      definition.projectFolder
    );
    taskName += ` - ${relativePath}`;
  }
  const task = new vscode.Task(
    definition,
    workspaceFolder,
    taskName,
    'gradle',
    new vscode.CustomExecution(
      async (): Promise<vscode.Pseudoterminal> => {
        return new CustomBuildTaskTerminal(client, projectFolder.fsPath, task);
      }
    ),
    ['$gradle']
  );
  const configTaskPresentationOptions: ConfigTaskPresentationOptions = getTaskPresentationOptions();
  task.presentationOptions = {
    ...configTaskPresentationOptions,
    ...{
      panel: getTaskPanelKind(configTaskPresentationOptions.panel),
      reveal: getTaskRevealKind(configTaskPresentationOptions.reveal),
    },
  };
  if (isTaskOfType(definition, 'build')) {
    task.group = vscode.TaskGroup.Build;
  }
  if (isTaskOfType(definition, 'test')) {
    task.group = vscode.TaskGroup.Test;
  }
  return task;
}

export async function cloneTask(
  task: vscode.Task,
  args: string,
  client: GradleTasksClient
): Promise<vscode.Task | undefined> {
  const folder = task.scope as vscode.WorkspaceFolder;
  const definition = { ...(task.definition as GradleTaskDefinition), args };
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
  logger.debug(`Gradle Tasks Server cmd: ${cmd} ${args}`);
  const taskType = 'gradle';
  const definition = {
    type: taskType,
  };
  const javaHome = getJavaHome();
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

export function handleCancelledTask(cancelled: Cancelled): void {
  setStoppedTaskAsComplete(cancelled.getTask(), cancelled.getSourceDir());
  vscode.commands.executeCommand('gradle.explorerRender');
}

export function runTask(task: vscode.Task): void {
  // TODO: check task ins't already running
  vscode.tasks.executeTask(task);
}

export async function runTaskWithArgs(
  task: vscode.Task,
  client: GradleTasksClient
): Promise<void> {
  const args = await vscode.window.showInputBox({
    placeHolder: localize(
      'gradleView.runTaskWithArgsExample',
      'For example: {0}',
      '--all'
    ),
    ignoreFocusOut: true,
  });
  if (args !== undefined) {
    const taskWithArgs = await cloneTask(task, args, client);
    if (taskWithArgs) {
      runTask(taskWithArgs);
    }
  }
}

export function registerTaskProvider(
  context: vscode.ExtensionContext,
  client: GradleTasksClient
): GradleTaskProvider {
  function refreshTasks(): void {
    vscode.commands.executeCommand('gradle.refresh', false);
  }
  const buildFileGlob = `**/*.{gradle,gradle.kts}`;
  const watcher = vscode.workspace.createFileSystemWatcher(buildFileGlob);
  context.subscriptions.push(watcher);
  watcher.onDidChange(refreshTasks);
  watcher.onDidDelete(refreshTasks);
  watcher.onDidCreate(refreshTasks);
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(refreshTasks)
  );
  const provider = new GradleTaskProvider(client);
  const taskProvider = vscode.tasks.registerTaskProvider('gradle', provider);
  context.subscriptions.push(taskProvider);
  return provider;
}
