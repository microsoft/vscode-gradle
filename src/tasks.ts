import {
  window,
  TaskDefinition,
  Task,
  WorkspaceFolder,
  RelativePattern,
  ShellExecution,
  Uri,
  workspace,
  TaskProvider,
  TaskScope,
  QuickPickItem,
  ProgressLocation,
  StatusBarItem,
  OutputChannel
} from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

import {
  getCustomBuildFile,
  getIsAutoDetectionEnabled,
  getTasksArgs
} from './config';

let autoDetectOverride: boolean = false;
let cachedTasks: Task[] | undefined = undefined;

export function enableTaskDetection() {
  autoDetectOverride = true;
}

export interface GradleTaskDefinition extends TaskDefinition {
  task: string;
  buildFile: string;
}

export interface FolderTaskItem extends QuickPickItem {
  label: string;
  task: Task;
}

export class GradleTaskProvider implements TaskProvider {
  constructor(
    readonly statusBarItem: StatusBarItem,
    readonly outputChannel: OutputChannel
  ) {}

  async provideTasks() {
    try {
      return await provideGradleTasks(this.statusBarItem, this.outputChannel);
    } catch (e) {
      this.outputChannel.append(`${e.message}\n`);
    }
  }

  // TODO: write tests that cover the case where auto-discover tasks is
  // switched off, but we can still run a task by setting the task definition
  // within tasks.json
  public async resolveTask(_task: Task): Promise<Task | undefined> {
    const gradleTask = (<any>_task.definition).task;
    if (gradleTask) {
      const { definition } = <any>_task;
      let gradleBuildFileUri: Uri;
      if (
        _task.scope === undefined ||
        _task.scope === TaskScope.Global ||
        _task.scope === TaskScope.Workspace
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
      const folder = workspace.getWorkspaceFolder(gradleBuildFileUri);
      if (folder) {
        return createTask(
          definition,
          definition.task,
          _task.scope,
          gradleBuildFileUri,
          await getGradleWrapperCommandFromFolder(folder)
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

export function isWorkspaceFolder(value: any): value is WorkspaceFolder {
  return value && typeof value !== 'number';
}

async function getGradleWrapperCommandFromFolder(
  folder: WorkspaceFolder
): Promise<string> {
  const platform = process.platform;
  if (
    platform === 'win32' &&
    (await exists(path.join(folder.uri.fsPath!, 'gradlew.bat')))
  ) {
    return '.\\gradlew.bat';
  } else if (
    (platform === 'linux' || platform === 'darwin') &&
    (await exists(path.join(folder.uri.fsPath!, 'gradlew')))
  ) {
    return './gradlew';
  } else {
    throw new Error('Gradle wrapper executable not found');
  }
}

async function detectGradleTasks(
  statusBarItem: StatusBarItem,
  outputChannel: OutputChannel
): Promise<Task[]> {
  const emptyTasks: Task[] = [];
  const allTasks: Task[] = [];
  const visitedBuildGradleFiles: Set<string> = new Set();

  const folders = workspace.workspaceFolders;
  if (!folders) {
    return emptyTasks;
  }
  try {
    for (const folder of folders) {
      if (autoDetectOverride || getIsAutoDetectionEnabled(folder)) {
        const customBuildFile = getCustomBuildFile(folder);
        const customBuildFileGlob = customBuildFile && `{${customBuildFile}}`;
        const defaultBuildFileGlob = '{build.gradle,build.gradle.kts}';
        const buildFileGlob = customBuildFileGlob || defaultBuildFileGlob;
        const relativePattern = new RelativePattern(
          folder,
          `**/${buildFileGlob}`
        );
        const paths = await workspace.findFiles(relativePattern);
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

export async function provideGradleTasks(
  statusBarItem: StatusBarItem,
  outputChannel: OutputChannel
): Promise<Task[]> {
  if (!cachedTasks) {
    cachedTasks = await detectGradleTasks(statusBarItem, outputChannel);
  }
  return cachedTasks;
}

async function provideGradleTasksForFolder(
  gradleBuildFileUri: Uri,
  statusBarItem: StatusBarItem,
  outputChannel: OutputChannel
): Promise<Task[]> {
  const emptyTasks: Task[] = [];

  const folder = workspace.getWorkspaceFolder(gradleBuildFileUri);
  if (!folder) {
    return emptyTasks;
  }
  const command = await getGradleWrapperCommandFromFolder(folder);
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
  return Object.keys(tasksMap)
    .sort((a, b) => a.localeCompare(b))
    .map(task => createTask(task, task, folder!, gradleBuildFileUri, command));
}

export function getTaskName(task: string, relativePath: string | undefined) {
  if (relativePath && relativePath.length) {
    return `${task} - ${relativePath.substring(0, relativePath.length - 1)}`;
  }
  return task;
}

export function createTask(
  taskDefinition: GradleTaskDefinition | string,
  taskName: string,
  folder: WorkspaceFolder,
  gradleBuildFileUri: Uri,
  command: string
): Task {
  let definition: GradleTaskDefinition;
  if (typeof taskDefinition === 'string') {
    definition = {
      type: 'gradle',
      task: taskDefinition,
      buildFile: path.basename(gradleBuildFileUri.fsPath)
    };
  } else {
    definition = taskDefinition;
  }

  function getCommandLine(task: string): string {
    const args: string[] = [];
    args.push(task);
    const customBuildFile = getCustomBuildFile(folder);
    if (customBuildFile) {
      args.push('--build-file', customBuildFile);
    }
    return `"${command}" ${args.join(' ')}`;
  }

  function getRelativePath(
    folder: WorkspaceFolder,
    gradleBuildFileUri: Uri
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
  const task = new Task(
    definition,
    folder,
    normalizedTaskName,
    'gradle',
    new ShellExecution(getCommandLine(taskName), { cwd }),
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
  const folders = workspace.workspaceFolders;
  if (!folders) {
    return false;
  }
  for (const folder of folders) {
    if (folder.uri.scheme !== 'file') {
      continue;
    }
    const customBuildFile = getCustomBuildFile(folder);
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

const TASK_REGEX: RegExp = /$\s*([a-z]+[A-Z0-9]?[a-z0-9]*[A-Za-z0-9]*)(\s-\s(.*))?/gm;

export function parseGradleTasks(buffer: Buffer | string): StringMap {
  const tasks: StringMap = {};
  let match: RegExpExecArray | null = null;
  while ((match = TASK_REGEX.exec(buffer.toString())) !== null) {
    const [, name, , description] = match;
    tasks[name] = description;
  }
  return tasks;
}

function spawn(
  command: string,
  args?: ReadonlyArray<string>,
  options?: cp.ExecOptions,
  outputChannel?: OutputChannel
): Promise<string> {
  if (outputChannel) {
    outputChannel.append(`Executing: ${command}\n`);
  }
  return new Promise((resolve, reject) => {
    const stdoutBuffers: Buffer[] = [];
    const stderrBuffers: Buffer[] = [];
    const child = cp.spawn(command, args, options);
    child.stdout.on('data', (b: Buffer) => stdoutBuffers.push(b));
    child.stderr.on('data', (b: Buffer) => stderrBuffers.push(b));
    child.on('error', reject);
    child.on('exit', (code: number) => {
      if (code === 0) {
        resolve(
          Buffer.concat(stdoutBuffers)
            .toString('utf8')
            .trim()
        );
      } else {
        reject(
          new Error(
            Buffer.concat(stderrBuffers)
              .toString('utf8')
              .trim()
          )
        );
      }
    });
  });
}

function getTasksFromGradle(
  command: string,
  folder: WorkspaceFolder,
  statusBarItem: StatusBarItem,
  outputChannel: OutputChannel
): Promise<string> {
  statusBarItem.text = '$(sync~spin) Refreshing gradle tasks';
  statusBarItem.show();

  const args = ['--quiet', '--console', 'plain', 'tasks'];
  const customBuildFile = getCustomBuildFile(folder);
  if (customBuildFile) {
    args.push('--build-file', customBuildFile);
  }
  const tasksArgs = getTasksArgs(folder);
  if (tasksArgs) {
    args.push(tasksArgs);
  }
  const { fsPath: cwd } = folder.uri;
  return spawn(command, args, { cwd }, outputChannel).finally(() =>
    statusBarItem.hide()
  );
}

async function getTasks(
  command: string,
  folder: WorkspaceFolder,
  statusBarItem: StatusBarItem,
  outputChannel: OutputChannel
): Promise<StringMap | undefined> {
  const stdout = await getTasksFromGradle(
    command,
    folder,
    statusBarItem,
    outputChannel
  );
  return parseGradleTasks(stdout);
}
