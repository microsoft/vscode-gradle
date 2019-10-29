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

let autoDetectOverride: boolean = false;

export function enableTaskDetection() {
  autoDetectOverride = true;
}

export interface GradleTaskDefinition extends TaskDefinition {
  task: string;
}

export interface FolderTaskItem extends QuickPickItem {
  label: string;
  task: Task;
}

type AutoDetect = 'on' | 'off';

let cachedTasks: Task[] | undefined = undefined;

export class GradleTaskProvider implements TaskProvider {
  constructor(
    readonly statusBarItem: StatusBarItem,
    readonly outputChannel: OutputChannel
  ) {}

  async provideTasks() {
    try {
      return await provideGradleTasks(this.statusBarItem);
    } catch (e) {
      this.outputChannel.append(e.message);
      this.statusBarItem.text = 'Error refreshing gradle tasks';
      this.statusBarItem.show();
    }
  }

  public async resolveTask(_task: Task): Promise<Task | undefined> {
    const gradleTask = (<any>_task.definition).task;
    if (gradleTask) {
      const { definition } = <any>_task;
      let buildGradleUri: Uri;
      if (
        _task.scope === undefined ||
        _task.scope === TaskScope.Global ||
        _task.scope === TaskScope.Workspace
      ) {
        // scope is required to be a WorkspaceFolder for resolveTask
        return undefined;
      }
      if (definition.path) {
        buildGradleUri = _task.scope.uri.with({
          path: _task.scope.uri.path + '/' + definition.path + 'build.gradle'
        });
      } else {
        buildGradleUri = _task.scope.uri.with({
          path: _task.scope.uri.path + '/build.gradle'
        });
      }
      const folder = workspace.getWorkspaceFolder(buildGradleUri);
      if (folder) {
        return createTask(
          definition,
          definition.task,
          _task.scope,
          buildGradleUri,
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
    return path.join(folder.uri.fsPath!, 'gradlew.bat');
  } else if (
    (platform === 'linux' || platform === 'darwin') &&
    (await exists(path.join(folder.uri.fsPath!, 'gradlew')))
  ) {
    return path.join(folder.uri.fsPath!, 'gradlew');
  } else {
    throw new Error('Gradle wrapper executable not found');
  }
}

async function detectGradleTasks(
  statusBarItem: StatusBarItem
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
      if (isAutoDetectionEnabled(folder)) {
        const relativePattern = new RelativePattern(
          folder,
          '**/{build.gradle,build.gradle.kts}'
        );
        const paths = await workspace.findFiles(relativePattern);
        for (const path of paths) {
          if (!visitedBuildGradleFiles.has(path.fsPath)) {
            const tasks = await provideGradleTasksForFolder(
              path,
              statusBarItem
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

export async function detectGradleTasksForFolder(
  folder: Uri,
  statusBarItem: StatusBarItem
): Promise<FolderTaskItem[]> {
  const folderTasks: FolderTaskItem[] = [];
  const tasks = await provideGradleTasksForFolder(folder, statusBarItem);
  folderTasks.push(...tasks.map(task => ({ label: task.name, task })));
  return folderTasks;
}

export async function provideGradleTasks(
  statusBarItem: StatusBarItem
): Promise<Task[]> {
  if (!cachedTasks) {
    cachedTasks = await detectGradleTasks(statusBarItem);
  }
  return cachedTasks;
}

function isAutoDetectionEnabled(folder: WorkspaceFolder): boolean {
  return (
    workspace
      .getConfiguration('gradle', folder.uri)
      .get<AutoDetect>('autoDetect') === 'on' || autoDetectOverride
  );
}

async function provideGradleTasksForFolder(
  gradleBuildFileUri: Uri,
  statusBarItem: StatusBarItem
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
  const tasksMap = await getTasks(command, folder, statusBarItem);
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
  buildGradleUri: Uri,
  command: string
): Task {
  let definition: GradleTaskDefinition;
  if (typeof taskDefinition === 'string') {
    definition = { type: 'gradle', task: taskDefinition };
  } else {
    definition = taskDefinition;
  }

  function getCommandLine(task: string): string {
    return `${command} ${task}`;
  }

  function getRelativePath(
    folder: WorkspaceFolder,
    buildGradleUri: Uri
  ): string {
    return path.relative(
      folder.uri.fsPath,
      path.dirname(buildGradleUri.fsPath)
    );
  }

  const relativeBuildGradle = getRelativePath(folder, buildGradleUri);
  if (relativeBuildGradle.length) {
    definition.path = relativeBuildGradle;
  }
  const normalizedTaskName = getTaskName(definition.task, relativeBuildGradle);
  const cwd = path.dirname(buildGradleUri.fsPath);
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

function getCustomBuildFilename(folder: WorkspaceFolder): string {
  return workspace
    .getConfiguration('gradle', folder.uri)
    .get<string>('customBuildFilename', '');
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
    const customBuildFilename = getCustomBuildFilename(folder);
    if (customBuildFilename) {
      const customBuildFilePath = path.join(
        folder.uri.fsPath,
        customBuildFilename
      );
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
    const defaultGradleSettingsFilePath = path.join(
      folder.uri.fsPath,
      'settings.gradle'
    );
    if (
      (await exists(defaultGroovyBuildFilePath)) ||
      (await exists(defaultKotlinBuildFilePath)) ||
      (await exists(defaultGradleSettingsFilePath))
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

const TASK_REGEX: RegExp = /$\s*([a-z0-9]+)\s-\s(.*)$/gim;

function parseGradleTasks(buffer: Buffer | string): StringMap {
  const tasks: StringMap = {};
  let match: RegExpExecArray | null = null;
  while ((match = TASK_REGEX.exec(buffer.toString())) !== null) {
    const [, name, description] = match;
    tasks[name] = description;
  }
  return tasks;
}

function getTasksArgs(folder: WorkspaceFolder): string {
  return workspace
    .getConfiguration('gradle', folder.uri)
    .get<string>('tasksArgs', '');
}

interface ProcessOutput {
  readonly stdout: string | Buffer;
  readonly stderr: string | Buffer;
}

function exec(
  command: string,
  args?: ReadonlyArray<string>,
  options?: cp.ExecOptions,
  onProcessCreate?: (process: cp.ChildProcess) => void
): Promise<ProcessOutput> {
  let cmd = command;
  if (args && args.length) {
    cmd = `${cmd} ${args.join(' ')}`;
  }
  return new Promise((resolve, reject) => {
    const process = cp.exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      }
      resolve({ stdout, stderr });
    });
    if (onProcessCreate) {
      onProcessCreate(process);
    }
  });
}

function getTasksFromGradle(
  command: string,
  folder: WorkspaceFolder,
  statusBarItem: StatusBarItem
): Promise<ProcessOutput> {
  statusBarItem.text = '$(sync~spin) Refreshing gradle tasks';
  statusBarItem.show();

  const args = ['--console', 'plain', 'tasks'];
  const customBuildFilename = getCustomBuildFilename(folder);
  if (customBuildFilename) {
    args.push('--build-file', customBuildFilename);
  }
  const tasksArgs = getTasksArgs(folder);
  if (tasksArgs) {
    args.push(tasksArgs);
  }
  const { fsPath: cwd } = folder.uri;

  let process: cp.ChildProcess;
  const promise = exec(command, args, { cwd }, _p => (process = _p));
  const showProgress = setTimeout(() => {
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'Loading Gradle Tasks',
        cancellable: true
      },
      (_, token) => {
        token.onCancellationRequested(() => {
          process.kill();
          window.showInformationMessage(
            'Operation cancelled. Try again using command "Gradle: Refresh Tasks"'
          );
        });
        return promise;
      }
    );
  }, 5000);

  return promise.finally(() => {
    clearTimeout(showProgress);
    statusBarItem.hide();
  });
}

async function getTasks(
  command: string,
  folder: WorkspaceFolder,
  statusBarItem: StatusBarItem
): Promise<StringMap | undefined> {
  const { stdout } = await getTasksFromGradle(command, folder, statusBarItem);
  return parseGradleTasks(stdout);
}
