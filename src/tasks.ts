import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import * as cp from 'child_process';

import { getCustomBuildFile, getIsAutoDetectionEnabled } from './config';

type GradleTask = {
  path: string;
  description: string;
  name: string;
  group: string;
  subproject: string;
};
let autoDetectOverride: boolean = false;
let cachedTasks: Promise<vscode.Task[]> | undefined = undefined;

export function enableTaskDetection() {
  autoDetectOverride = true;
}

export interface GradleTaskDefinition extends vscode.TaskDefinition {
  script: string;
  fileName: string;
  description: string;
  group: string;
  subproject: string;
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

  // TODO: write tests that cover the case where auto-discover tasks is
  // switched off, but we can still run a task by setting the task definition
  // within tasks.json
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
          const paths = await getBuildFilePaths(folder.uri);
          for (const path of paths) {
            if (!visitedBuildGradleFiles.has(path.fsPath)) {
              const tasks = await this.provideGradleTasksForFolder(path);
              visitedBuildGradleFiles.add(path.fsPath);
              allTasks.push(...tasks);
            }
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
    const gradleTasks: GradleTask[] | undefined = await this.getTasks(
      command,
      folder,
      gradleBuildFileUri
    );
    if (!gradleTasks || !gradleTasks.length) {
      return emptyTasks;
    }

    const filteredGradleTasks = gradleTasks.filter(
      task => task.name !== 'vscodeTasksJson'
    );

    const tasks: vscode.Task[] = [];
    for (const gradleTask of filteredGradleTasks) {
      tasks.push(
        await createTask(
          gradleTask.name,
          gradleTask.description,
          gradleTask.group,
          gradleTask.subproject,
          gradleTask.path,
          folder!,
          gradleBuildFileUri,
          command
        )
      );
    }
    return tasks;
  }

  private async getTasksFromGradle(
    command2: string,
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

  private async getTasks(
    command: string,
    folder: vscode.WorkspaceFolder,
    gradleBuildFileUri: vscode.Uri
  ): Promise<GradleTask[] | undefined> {
    const stdout = await this.getTasksFromGradle(
      command,
      folder,
      gradleBuildFileUri
    );
    return parseGradleTasks(stdout);
  }

  private getTasksJsonFile(gradleBuildFileUri: vscode.Uri) {
    switch (path.extname(gradleBuildFileUri.fsPath)) {
      case '.gradle':
        return this.context.asAbsolutePath(
          path.join('resources', 'gradle', 'tasks-json.groovy')
        );
      case '.kts':
        return this.context.asAbsolutePath(
          path.join('resources', 'gradle', 'tasks-json.kts')
        );
      default:
        throw new Error('Unable gradle build file type');
    }
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

export async function getBuildFilePaths(
  uri: vscode.Uri
): Promise<vscode.Uri[]> {
  const customBuildFile = getCustomBuildFile(uri);
  const customBuildFileGlob = customBuildFile && `{${customBuildFile}}`;
  const defaultBuildFileGlob = '{build.gradle,build.gradle.kts}';
  const buildFileGlob = customBuildFileGlob || defaultBuildFileGlob;
  const relativePattern = new vscode.RelativePattern(uri.fsPath, buildFileGlob);
  const paths = await vscode.workspace.findFiles(relativePattern);
  return paths;
}

export function getTaskName(task: string, relativePath: string | undefined) {
  if (relativePath && relativePath.length) {
    return `${task} - ${relativePath.substring(0, relativePath.length - 1)}`;
  }
  return task;
}

export async function createTask(
  taskName: string,
  taskDescription: string,
  taskGroup: string,
  taskSubProject: string,
  taskPath: string,
  folder: vscode.WorkspaceFolder,
  gradleBuildFileUri: vscode.Uri,
  command: string
): Promise<vscode.Task> {
  function getCommandLine(task: string): string {
    const args: string[] = [];
    args.push(task);
    const customBuildFile = getCustomBuildFile(folder.uri);
    if (customBuildFile) {
      args.push('--build-file', customBuildFile);
    }
    return `"${command}" ${args.join(' ')}`;
  }

  function getRelativePath(
    folder: vscode.WorkspaceFolder,
    gradleBuildFileUri: vscode.Uri
  ): string {
    return path.relative(
      folder.uri.fsPath,
      path.dirname(gradleBuildFileUri.fsPath)
    );
  }

  let fileName: string = path.basename(gradleBuildFileUri.fsPath);
  if (taskSubProject) {
    const subProjectPath = path.join(folder.uri.fsPath, taskSubProject);
    const folderUri = vscode.Uri.file(subProjectPath);
    const uri = (await getBuildFilePaths(folderUri))[0];
    fileName = path.basename(uri.fsPath);
  }
  const definition: GradleTaskDefinition = {
    type: 'gradle',
    script: taskName,
    fileName,
    description: taskDescription,
    group: (taskGroup || 'other').toLowerCase(),
    subproject: taskSubProject
  };

  const relativeBuildGradle = getRelativePath(folder, gradleBuildFileUri);
  if (relativeBuildGradle.length) {
    definition.path = relativeBuildGradle;
  }
  const normalizedTaskName = getTaskName(
    definition.script,
    relativeBuildGradle
  );
  const cwd = path.dirname(gradleBuildFileUri.fsPath);
  const task = new vscode.Task(
    definition,
    folder,
    normalizedTaskName,
    'gradle',
    new vscode.ShellExecution(getCommandLine(taskPath), { cwd }),
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
    const customBuildFile = getCustomBuildFile(folder.uri);
    if (customBuildFile) {
      const customBuildFilePath = path.join(folder.uri.fsPath, customBuildFile);
      if (await exists(customBuildFilePath)) {
        return true;
      } else {
        // If custom build filename is set then don't check for default build files
        continue;
      }
    }
    const defaultGroovyBuildFilePath = path.join(
      folder.uri.fsPath,
      'build.gradle'
    );
    const defaultKotlinBuildFilePath = path.join(
      folder.uri.fsPath,
      'build.gradle.kts'
    );
    if (
      (await exists(defaultGroovyBuildFilePath)) ||
      (await exists(defaultKotlinBuildFilePath))
    ) {
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

export function parseGradleTasks(buffer: Buffer | string): GradleTask[] {
  return JSON.parse(buffer.toString());
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
        reject(new Error(getBuffersAsString(stderrBuffers)));
      }
    });
  });
}
