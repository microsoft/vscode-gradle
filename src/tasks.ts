import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import { getIsAutoDetectionEnabled } from './config';

type GradleTask = {
  path: string;
  description: string;
  name: string;
  group: string;
  project: string;
};

type GradleProject = {
  name: string;
  path: string;
  parent: string;
  tasks: GradleTask[];
};

export interface GradleTaskDefinition extends vscode.TaskDefinition {
  script: string;
  description: string;
  group: string;
  project: string;
  rootProject: string;
  rootBuildFilePath: string;
}

let autoDetectOverride: boolean = false;
let cachedTasks: Promise<vscode.Task[]> | undefined = undefined;

export function enableTaskDetection() {
  autoDetectOverride = true;
}

export class GradleTaskProvider implements vscode.TaskProvider {
  constructor(
    readonly statusBarItem: vscode.StatusBarItem,
    readonly outputChannel: vscode.OutputChannel,
    readonly context: vscode.ExtensionContext
  ) {}

  async provideTasks() {
    try {
      return await this.provideGradleTasks();
    } catch (e) {
      this.outputChannel.append(`Error providing gradle tasks: ${e.message}\n`);
    }
  }

  // TODO
  public async resolveTask(
    _task: vscode.Task
  ): Promise<vscode.Task | undefined> {
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
    const visitedBuildGradleFiles: Set<string> = new Set();

    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return emptyTasks;
    }
    try {
      for (const folder of folders) {
        if (autoDetectOverride || getIsAutoDetectionEnabled(folder)) {
          const rootBuildFilePath = await getBuildFilePath(folder.uri);
          if (
            rootBuildFilePath &&
            !visitedBuildGradleFiles.has(rootBuildFilePath.fsPath)
          ) {
            const tasks = await this.provideGradleTasksForFolder(
              rootBuildFilePath
            );
            visitedBuildGradleFiles.add(rootBuildFilePath.fsPath);
            allTasks.push(...tasks);
          }
        }
      }
      return allTasks;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private async provideGradleTasksForFolder(
    gradleBuildFileUri: vscode.Uri
  ): Promise<vscode.Task[]> {
    const emptyTasks: vscode.Task[] = [];

    const folder = vscode.workspace.getWorkspaceFolder(gradleBuildFileUri);
    if (!folder) {
      return emptyTasks;
    }
    const command = await getGradleWrapperCommandFromPath(folder.uri.fsPath);
    if (!command) {
      return emptyTasks;
    }
    const gradleProjects:
      | GradleProject[]
      | undefined = await this.getGradleProjects(folder, gradleBuildFileUri);
    if (!gradleProjects || !gradleProjects.length) {
      return emptyTasks;
    }

    const rootProject: GradleProject | undefined = gradleProjects.find(
      project => !project.parent
    );
    if (!rootProject) {
      return emptyTasks;
    }

    const rootBuildFile = await getBuildFilePath(
      vscode.Uri.file(
        path.join(folder.uri.fsPath, ...rootProject.path.split(':'))
      )
    );
    if (!rootBuildFile) {
      return emptyTasks;
    }

    const tasks: vscode.Task[] = [];

    for (const gradleProject of gradleProjects) {
      for (const gradleTask of gradleProject.tasks) {
        tasks.push(
          await createTask(
            gradleTask,
            folder!,
            command,
            rootProject.name,
            rootBuildFile
          )
        );
      }
    }

    return tasks;
  }

  private async getProjectsFromGradle(
    folder: vscode.WorkspaceFolder,
    gradleBuildFileUri: vscode.Uri
  ): Promise<string> {
    this.statusBarItem.text = '$(sync~spin) Refreshing gradle tasks';
    this.statusBarItem.show();
    const command = this.context.asAbsolutePath(
      path.join('lib', getTasksScriptCommand())
    );
    const args = [folder.uri.fsPath];
    const { fsPath: cwd } = folder.uri;
    return spawn(command, args, { cwd }, this.outputChannel).finally(() => {
      this.statusBarItem.hide();
    });
  }

  private async getGradleProjects(
    folder: vscode.WorkspaceFolder,
    rootGradleBuildFileUri: vscode.Uri
  ): Promise<GradleProject[] | undefined> {
    const stdout = await this.getProjectsFromGradle(
      folder,
      rootGradleBuildFileUri
    );
    return parseGradleProjects(stdout);
  }
}

export function invalidateTasksCache() {
  cachedTasks = undefined;
}

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

export function getTasksScriptCommand(): string {
  const platform = process.platform;
  if (platform === 'win32') {
    return '.\\gradle-tasks.bat';
  } else if (platform === 'linux' || platform === 'darwin') {
    return './gradle-tasks';
  } else {
    throw new Error('Unsupported platform');
  }
}

export async function getBuildFilePath(
  uri: vscode.Uri
): Promise<vscode.Uri | undefined> {
  const defaultBuildFileGlob = '{*.gradle,*.gradle.kts}';
  const relativePattern = new vscode.RelativePattern(
    uri.fsPath,
    defaultBuildFileGlob
  );
  return (await vscode.workspace.findFiles(relativePattern))[0];
}

export function getTaskName(task: string, relativePath: string | undefined) {
  if (relativePath && relativePath.length) {
    return `${task} - ${relativePath.substring(0, relativePath.length - 1)}`;
  }
  return task;
}

export async function createTask(
  gradleTask: GradleTask,
  folder: vscode.WorkspaceFolder,
  command: string,
  rootProject: string,
  rootBuildFile: vscode.Uri
): Promise<vscode.Task> {
  function getCommandLine(task: string): string {
    const args: string[] = [];
    args.push(task);
    // const customBuildFile = getCustomBuildFile(folder.uri);
    // if (customBuildFile) {
    //   args.push('--build-file', customBuildFile);
    // }
    return `"${command}" ${args.join(' ')}`;
  }

  const friendlyTaskName = gradleTask.path.replace(/^:/, '');
  const definition: GradleTaskDefinition = {
    type: 'gradle',
    script: friendlyTaskName,
    description: gradleTask.description,
    group: (gradleTask.group || 'other').toLowerCase(),
    project: gradleTask.project,
    rootBuildFilePath: rootBuildFile.fsPath,
    rootProject
  };
  const cwd = folder.uri.fsPath;
  const cmd = getCommandLine(definition.script);
  const task = new vscode.Task(
    definition,
    folder,
    definition.script,
    'gradle',
    new vscode.ShellExecution(cmd, { cwd }),
    ['$gradle']
  );
  task.presentationOptions = {
    clear: true,
    showReuseMessage: false,
    focus: true
  };
  return task;
}

export async function hasGradleBuildFile(): Promise<boolean> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) {
    return false;
  }
  for (const folder of folders) {
    if (folder.uri.scheme !== 'file') {
      continue;
    }
    const buildFilePath = await getBuildFilePath(folder.uri);
    if (buildFilePath) {
      return true;
    }
  }
  return false;
}

async function exists(file: string): Promise<boolean> {
  return new Promise<boolean>((resolve, _reject) => {
    fs.exists(file, value => {
      resolve(value);
    });
  });
}

export function parseGradleProjects(buffer: Buffer | string): GradleProject[] {
  const input = buffer.toString();
  try {
    return JSON.parse(input);
  } catch (e) {
    throw new Error(`${e.message} - input: ${input}`);
  }
}

function getBuffersAsString(buffers: Buffer[]): string {
  return Buffer.concat(buffers)
    .toString('utf8')
    .trim();
}

function debugCommand(
  command: string,
  args: ReadonlyArray<string> = [],
  outputChannel: vscode.OutputChannel
) {
  console.log(`Executing: ${command} ${args.join(' ')}\n`);
  outputChannel.append(`Executing: ${command} ${args.join(' ')}\n`);
}

export function spawn(
  command: string,
  args: ReadonlyArray<string> = [],
  options: cp.ExecOptions = {},
  outputChannel?: vscode.OutputChannel
): Promise<string> {
  if (outputChannel) {
    debugCommand(command, args, outputChannel);
  }
  return new Promise((resolve, reject) => {
    const stdoutBuffers: Buffer[] = [];
    const stderrBuffers: Buffer[] = [];
    const child = cp.spawn(command, args, options);
    child.stdout.on('data', (buffer: Buffer) => stdoutBuffers.push(buffer));
    child.stderr.on('data', (buffer: Buffer) => stderrBuffers.push(buffer));
    child.on('error', err => {
      reject(err);
    });
    child.on('exit', (code: number) => {
      if (code === 0) {
        resolve(getBuffersAsString(stdoutBuffers));
      } else {
        console.log('error', stderrBuffers.toString());
        reject(new Error(getBuffersAsString(stderrBuffers)));
      }
    });
  });
}
