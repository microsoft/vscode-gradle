import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import {
  getCustomBuildFile,
  getIsAutoDetectionEnabled,
  getTasksArgs
} from './config';

let autoDetectOverride: boolean = false;
let cachedTasks: Promise<vscode.Task[]> | undefined = undefined;

export function enableTaskDetection() {
  autoDetectOverride = true;
}

export interface GradleTaskDefinition extends vscode.TaskDefinition {
  task: string;
  buildFile: string;
  subProjectBuildFile: string | undefined;
}

export class GradleTaskProvider implements vscode.TaskProvider {
  constructor(
    readonly statusBarItem: vscode.StatusBarItem,
    readonly outputChannel: vscode.OutputChannel
  ) {}

  async provideTasks() {
    try {
      return await provideGradleTasks(this.statusBarItem, this.outputChannel);
    } catch (e) {
      this.outputChannel.append(`Error providing gradle tasks: ${e.message}\n`);
      this.outputChannel.show();
    }
  }

  // TODO: write tests that cover the case where auto-discover tasks is
  // switched off, but we can still run a task by setting the task definition
  // within tasks.json
  public async resolveTask(
    _task: vscode.Task
  ): Promise<vscode.Task | undefined> {
    const gradleTask = (<any>_task.definition).task;
    if (gradleTask) {
      const { definition } = <any>_task;
      let gradleBuildFileUri: vscode.Uri;
      if (
        _task.scope === undefined ||
        _task.scope === vscode.TaskScope.Global ||
        _task.scope === vscode.TaskScope.Workspace
      ) {
        // scope is required to be a WorkspaceFolder for resolveTask
        return undefined;
      }
      if (definition.path) {
        gradleBuildFileUri = _task.scope.uri.with({
          path: _task.scope.uri.path + '/' + definition.path + 'build.gradle'
        });
      } else {
        gradleBuildFileUri = _task.scope.uri.with({
          path: _task.scope.uri.path + '/build.gradle'
        });
      }
      const folder = vscode.workspace.getWorkspaceFolder(gradleBuildFileUri);
      if (folder) {
        return createTask(
          definition,
          definition.task,
          _task.scope,
          gradleBuildFileUri,
          await getGradleWrapperCommandFromPath(folder.uri.fsPath)
        );
      }
      return undefined;
    }
    return undefined;
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

async function detectGradleTasks(
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel
): Promise<vscode.Task[]> {
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
            const tasks = await provideGradleTasksForFolder(
              path,
              statusBarItem,
              outputChannel
            );
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

export function provideGradleTasks(
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel
): Promise<vscode.Task[]> {
  if (!cachedTasks) {
    cachedTasks = detectGradleTasks(statusBarItem, outputChannel);
  }
  return cachedTasks;
}

async function provideGradleTasksForFolder(
  gradleBuildFileUri: vscode.Uri,
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel
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
  const tasksMap = await getTasks(
    command,
    folder,
    statusBarItem,
    outputChannel
  );
  if (!tasksMap) {
    return emptyTasks;
  }

  const sortedKeys = Object.keys(tasksMap).sort((a, b) => a.localeCompare(b));

  const tasks: vscode.Task[] = [];
  for (const task of sortedKeys) {
    tasks.push(
      await createTask(task, task, folder!, gradleBuildFileUri, command)
    );
  }
  return tasks;
}

export function getTaskName(task: string, relativePath: string | undefined) {
  if (relativePath && relativePath.length) {
    return `${task} - ${relativePath.substring(0, relativePath.length - 1)}`;
  }
  return task;
}

export async function createTask(
  taskDefinitionOrTaskName: GradleTaskDefinition | string,
  taskName: string,
  folder: vscode.WorkspaceFolder,
  gradleBuildFileUri: vscode.Uri,
  command: string
): Promise<vscode.Task> {
  let definition: GradleTaskDefinition;
  if (typeof taskDefinitionOrTaskName === 'string') {
    let subProjectBuildFile: string | undefined = undefined;
    if (taskDefinitionOrTaskName.includes(':')) {
      const [subProjectName] = taskDefinitionOrTaskName.split(':');
      const subProjectPath = path.join(folder.uri.fsPath, subProjectName);
      const folderUri = vscode.Uri.file(subProjectPath);
      const buildFile = (await getBuildFilePaths(folderUri))[0];
      subProjectBuildFile = buildFile.fsPath;
    }

    definition = {
      type: 'richardwillis.gradle',
      task: taskDefinitionOrTaskName,
      buildFile: path.basename(gradleBuildFileUri.fsPath),
      subProjectBuildFile
    };
  } else {
    definition = taskDefinitionOrTaskName;
  }

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

  const relativeBuildGradle = getRelativePath(folder, gradleBuildFileUri);
  if (relativeBuildGradle.length) {
    definition.path = relativeBuildGradle;
  }
  const normalizedTaskName = getTaskName(definition.task, relativeBuildGradle);
  const cwd = path.dirname(gradleBuildFileUri.fsPath);
  const task = new vscode.Task(
    definition,
    folder,
    normalizedTaskName,
    'gradle',
    new vscode.ShellExecution(getCommandLine(taskName), { cwd }),
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

type StringMap = { [s: string]: string };

const TASK_REGEX: RegExp = /$\s*(([^:\s]*:)?([a-z]+[A-Z0-9]?[a-z0-9]*[A-Za-z0-9]*))\b(\s-\s(.*))?/gm;

export function parseGradleTasks(buffer: Buffer | string): StringMap {
  const tasks: StringMap = {};
  let match: RegExpExecArray | null = null;
  while ((match = TASK_REGEX.exec(buffer.toString())) !== null) {
    const [, name, , , , description] = match;
    tasks[name] = description;
  }
  return tasks;
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

function getTasksFromGradle(
  command: string,
  folder: vscode.WorkspaceFolder,
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel
): Promise<string> {
  statusBarItem.text = '$(sync~spin) Refreshing gradle tasks';
  statusBarItem.show();

  const args = ['--quiet', 'tasks'];
  const tasksArgs = getTasksArgs(folder);
  if (tasksArgs) {
    args.push(tasksArgs);
  }
  const customBuildFile = getCustomBuildFile(folder.uri);
  if (customBuildFile) {
    args.push('--build-file', customBuildFile);
  }
  const { fsPath: cwd } = folder.uri;
  return spawn(command, args, { cwd }, outputChannel).finally(() => {
    statusBarItem.hide();
  });
}

async function getTasks(
  command: string,
  folder: vscode.WorkspaceFolder,
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel
): Promise<StringMap | undefined> {
  const stdout = await getTasksFromGradle(
    command,
    folder,
    statusBarItem,
    outputChannel
  );
  return parseGradleTasks(stdout);
}
