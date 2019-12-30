import * as vscode from 'vscode';
import * as path from 'path';

import { getIsAutoDetectionEnabled } from './config';
import { GradleTasksClient, GradleTask, ServerMessage } from './client';

export interface GradleTaskDefinition extends vscode.TaskDefinition {
  script: string;
  description: string;
  group: string;
  project: string;
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
  return vscode.tasks.taskExecutions.find(e => e.task === task);
}

export function getGradleTaskExecutions(): vscode.TaskExecution[] {
  return vscode.tasks.taskExecutions.filter(e => e.task.source === 'gradle');
}

export function stopRunningGradleTasks(): void {
  const taskExecutions = getGradleTaskExecutions();
  taskExecutions.forEach(execution => {
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
    new Set(gradleWrapperFiles.map(file => path.dirname(file.fsPath)))
  ).map(folder => vscode.Uri.file(folder));
  const gradleProjectFolders: vscode.Uri[] = [];
  for (const gradleWrapperFolder of gradleWrapperFolders) {
    if (await hasGradleBuildFile(gradleWrapperFolder)) {
      gradleProjectFolders.push(gradleWrapperFolder);
    }
  }
  return gradleProjectFolders;
}

export class GradleTaskProvider implements vscode.TaskProvider {
  private client: GradleTasksClient | undefined = undefined;
  private refreshPromise: Promise<void> | undefined = undefined;

  constructor(
    readonly statusBarItem: vscode.StatusBarItem,
    readonly outputChannel: vscode.OutputChannel,
    readonly context: vscode.ExtensionContext
  ) {}

  public setClient(client: GradleTasksClient): void {
    this.client = client;
  }

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

  private async refreshTasks(folders: vscode.WorkspaceFolder[]): Promise<void> {
    const allTasks: vscode.Task[] = [];
    try {
      for (const workspaceFolder of folders) {
        if (autoDetectOverride || getIsAutoDetectionEnabled(workspaceFolder)) {
          const projectFolders = await getGradleProjectFolders(workspaceFolder);
          for (const projectFolder of projectFolders) {
            allTasks.push(
              ...(await this.provideGradleTasksForFolder(
                workspaceFolder,
                projectFolder
              ))
            );
          }
        }
      }
      cachedTasks = allTasks;
    } catch (e) {
      cachedTasks = emptyTasks;
      const message = `Error providing gradle tasks: ${e.message}`;
      console.error(message);
      this.outputChannel.appendLine(message);
    }
  }

  public async refresh(): Promise<vscode.Task[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      cachedTasks = emptyTasks;
    } else {
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshTasks(folders).then(() => {
          this.refreshPromise = undefined;
        });
      }
      await this.refreshPromise;
    }
    return cachedTasks;
  }

  private async provideGradleTasksForFolder(
    workspaceFolder: vscode.WorkspaceFolder,
    projectFolder: vscode.Uri
  ): Promise<vscode.Task[]> {
    const gradleTasks: GradleTask[] | undefined = await this.getGradleTasks(
      projectFolder
    );
    if (!gradleTasks || !gradleTasks.length) {
      return emptyTasks;
    }
    return gradleTasks.map(gradleTask =>
      this.createVSCodeTaskFromGradleTask(
        gradleTask,
        workspaceFolder,
        gradleTask.rootProject,
        vscode.Uri.file(gradleTask.buildFile),
        projectFolder
      )
    );
  }

  private createVSCodeTaskFromGradleTask(
    gradleTask: GradleTask,
    workspaceFolder: vscode.WorkspaceFolder,
    rootProject: string,
    buildFile: vscode.Uri,
    projectFolder: vscode.Uri,
    args = ''
  ): vscode.Task {
    const script = gradleTask.path.replace(/^:/, '');
    const definition: GradleTaskDefinition = {
      type: 'gradle',
      script,
      description: gradleTask.description,
      group: (gradleTask.group || 'other').toLowerCase(),
      project: gradleTask.project,
      buildFile: buildFile.fsPath,
      rootProject,
      projectFolder: projectFolder.fsPath,
      workspaceFolder: workspaceFolder.uri.fsPath,
      args
    };

    return createTaskFromDefinition(
      definition,
      workspaceFolder,
      projectFolder,
      this.client!
    );
  }

  private async getGradleTasks(
    projectFolder: vscode.Uri
  ): Promise<GradleTask[] | undefined> {
    return this.client?.getTasks(projectFolder.fsPath);
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
    return '.\\gradle-tasks.bat';
  } else if (platform === 'linux' || platform === 'darwin') {
    return './gradle-tasks';
  } else {
    throw new Error('Unsupported platform');
  }
}

function isTaskOfType(definition: GradleTaskDefinition, type: string): boolean {
  return (
    definition.group.toLowerCase() === type ||
    definition.script
      .split(' ')[0]
      .split(':')
      .pop() === type
  );
}

class CustomBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
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
    this.client.stopTask(this.sourceDir, this.task.definition.script);
  }

  private async doBuild(): Promise<void> {
    const args = this.task.definition.args.split(' ').filter(Boolean);
    await this.client.runTask(
      this.sourceDir,
      this.task.definition.script,
      args,
      (message: ServerMessage) => {
        this.writeEmitter.fire(message.message?.toString() + '\r\n');
      }
    );
    setTimeout(() => {
      this.closeEmitter.fire();
    }, 100); // give the UI some time to render the terminal
  }

  handleInput(data: string): void {
    if (data === '\x03') {
      vscode.commands.executeCommand('gradle.stopTask', this.task);
    }
  }
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
  task.presentationOptions = {
    clear: true,
    showReuseMessage: false,
    focus: true,
    panel: vscode.TaskPanelKind.Shared,
    reveal: vscode.TaskRevealKind.Always
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

export async function hasGradleProject(): Promise<boolean> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) {
    return false;
  }
  for (const folder of folders) {
    if (folder.uri.scheme !== 'file') {
      continue;
    }
    const projectFolders = await getGradleProjectFolders(folder);
    if (projectFolders.length) {
      return true;
    }
  }
  return false;
}

export function buildGradleServerTask(
  taskName: string,
  cwd: string,
  args: string[] = []
): vscode.Task {
  const cmd = getGradleTasksServerCommand();
  const definition = {
    type: 'gradle'
  };
  const task = new vscode.Task(
    definition,
    vscode.TaskScope.Workspace,
    taskName,
    'gradle',
    new vscode.ProcessExecution(cmd, args, { cwd })
  );
  task.isBackground = true;
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Never,
    focus: false,
    echo: false,
    panel: vscode.TaskPanelKind.Shared
  };
  return task;
}
