import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import { getIsAutoDetectionEnabled } from './config';
import { GradleTasksClient, GradleTask } from './server';

export interface GradleTaskDefinition extends vscode.TaskDefinition {
  script: string;
  description: string;
  group: string;
  project: string;
  rootProject: string;
  buildFile: string;
  projectFolder: string;
  workspaceFolder: string;
}

let autoDetectOverride = false;
let cachedTasks: Promise<vscode.Task[]> | undefined;
let gradleTasksProcess: cp.ChildProcessWithoutNullStreams | undefined;

export function enableTaskDetection(): void {
  autoDetectOverride = true;
}

export function killRefreshProcess(): void {
  if (gradleTasksProcess) {
    gradleTasksProcess.kill();
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
  rootWorkspacefolder: vscode.WorkspaceFolder
): Promise<vscode.Uri[]> {
  const gradleWrapperFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(rootWorkspacefolder, '**/*{gradlew,gradlew.bat}')
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
  constructor(
    readonly statusBarItem: vscode.StatusBarItem,
    readonly outputChannel: vscode.OutputChannel,
    readonly context: vscode.ExtensionContext,
    readonly client: GradleTasksClient
  ) {}

  async provideTasks(): Promise<vscode.Task[] | undefined> {
    try {
      return await this.provideGradleTasks();
    } catch (e) {
      const message = `Error providing gradle tasks: ${e.message}`;
      console.error(message);
      this.outputChannel.appendLine(message);
    }
  }

  // TODO
  public async resolveTask(/*
    _task: vscode.Task
  */): Promise<
    vscode.Task | undefined
  > {
    return undefined;
  }

  private provideGradleTasks(): Promise<vscode.Task[]> {
    if (!cachedTasks) {
      cachedTasks = this.detectGradleTasks();
    }
    return cachedTasks;
  }

  private async detectGradleTasks(): Promise<vscode.Task[]> {
    const emptyTasks: vscode.Task[] = [];
    const allTasks: vscode.Task[] = [];
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return emptyTasks;
    }
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
      return allTasks;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private async provideGradleTasksForFolder(
    workspaceFolder: vscode.WorkspaceFolder,
    projectFolder: vscode.Uri
  ): Promise<vscode.Task[]> {
    const emptyTasks: vscode.Task[] = [];
    const command = await getGradleWrapperCommandFromPath(projectFolder.fsPath);
    if (!command) {
      return emptyTasks;
    }
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
    shellArgs: string[] = []
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
      workspaceFolder: workspaceFolder.uri.fsPath
    };

    return createTaskFromDefinition(
      definition,
      workspaceFolder,
      projectFolder,
      shellArgs,
      this.client
    );
  }

  private async getGradleTasks(
    projectFolder: vscode.Uri
  ): Promise<GradleTask[] | undefined> {
    return this.client.getTasks(projectFolder.fsPath);
  }
}

export function invalidateTasksCache(): void {
  cachedTasks = undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isWorkspaceFolder(value: any): value is vscode.WorkspaceFolder {
  return value && typeof value !== 'number';
}

export async function getGradleWrapperCommandFromPath(
  fsPath: string
): Promise<string> {
  const platform = process.platform;
  if (
    platform === 'win32' &&
    (await exists(path.join(fsPath, 'gradlew.bat')))
  ) {
    return '.\\gradlew.bat';
  } else if (
    (platform === 'linux' || platform === 'darwin') &&
    (await exists(path.join(fsPath, 'gradlew')))
  ) {
    return './gradlew';
  } else {
    throw new Error('Gradle wrapper executable not found');
  }
}

export function getGradleTasksCommand(): string {
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
    private readonly task: string,
    private readonly args: string[]
  ) {}

  open(): void {
    this.doBuild();
  }

  close(): void {
    //
  }

  private async doBuild(): Promise<void> {
    this.writeEmitter.fire('Starting build...\r\n');
    await this.client.runTask(this.sourceDir, this.task, this.args);
    this.writeEmitter.fire('Build complete.\r\n\r\n');
    this.closeEmitter.fire();
  }
}

export function createTaskFromDefinition(
  definition: GradleTaskDefinition,
  workspaceFolder: vscode.WorkspaceFolder,
  projectFolder: vscode.Uri,
  args: string[] = [],
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
        return new CustomBuildTaskTerminal(
          client,
          projectFolder.fsPath,
          definition.script,
          args
        );
      }
    ),
    ['$gradle']
  );
  task.presentationOptions = {
    clear: true,
    showReuseMessage: false,
    focus: true
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
  args: string[] = [],
  client: GradleTasksClient
): Promise<vscode.Task | undefined> {
  const folder = task.scope as vscode.WorkspaceFolder;
  const command = await getGradleWrapperCommandFromPath(folder.uri.fsPath);
  if (!command) {
    return undefined;
  }
  return createTaskFromDefinition(
    task.definition as GradleTaskDefinition,
    folder,
    task.definition.projectFolder,
    args,
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

async function exists(file: string): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    fs.exists(file, value => {
      resolve(value);
    });
  });
}
