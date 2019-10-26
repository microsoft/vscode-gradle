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
  Disposable
} from 'vscode';
import * as util from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

const cpExec = util.promisify(cp.exec);

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
  constructor() {}

  async provideTasks() {
    try {
      return await provideGradleTasks();
    } catch (e) {
      window.showErrorMessage(`Unable to get gradle tasks - ${e.message}`);
    }
  }

  public async resolveTask(_task: Task): Promise<Task | undefined> {
    const gradleTask = (<any>_task.definition).task;
    if (gradleTask) {
      const kind: GradleTaskDefinition = <any>_task.definition;
      let buildGradleUri: Uri;
      if (
        _task.scope === undefined ||
        _task.scope === TaskScope.Global ||
        _task.scope === TaskScope.Workspace
      ) {
        // scope is required to be a WorkspaceFolder for resolveTask
        return undefined;
      }
      if (kind.path) {
        buildGradleUri = _task.scope.uri.with({
          path: _task.scope.uri.path + '/' + kind.path + 'build.gradle'
        });
      } else {
        buildGradleUri = _task.scope.uri.with({
          path: _task.scope.uri.path + '/build.gradle'
        });
      }
      const folder = workspace.getWorkspaceFolder(buildGradleUri);
      if (folder) {
        return createTask(
          kind,
          kind.task,
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

async function detectGradleTasks(): Promise<Task[]> {
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
        const relativePattern = new RelativePattern(folder, '**/build.gradle');
        const paths = await workspace.findFiles(relativePattern);
        for (const path of paths) {
          if (!visitedBuildGradleFiles.has(path.fsPath)) {
            const tasks = await provideGradleTasksForFolder(path);
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
  folder: Uri
): Promise<FolderTaskItem[]> {
  const folderTasks: FolderTaskItem[] = [];
  const tasks = await provideGradleTasksForFolder(folder);
  folderTasks.push(...tasks.map(t => ({ label: t.name, task: t })));
  return folderTasks;
}

export async function provideGradleTasks(): Promise<Task[]> {
  if (!cachedTasks) {
    cachedTasks = await detectGradleTasks();
  }
  return cachedTasks;
}

function isAutoDetectionEnabled(folder: WorkspaceFolder): boolean {
  return (
    workspace
      .getConfiguration('gradle', folder.uri)
      .get<AutoDetect>('autoDetect') === 'on'
  );
}

async function provideGradleTasksForFolder(
  gradleBuildFileUri: Uri
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
  const tasksMap = await getTasks(command, folder);
  if (!tasksMap) {
    return emptyTasks;
  }
  return Object.keys(tasksMap)
    .sort((a, b) => a.localeCompare(b))
    .map(task =>
      createTask(
        task,
        task,
        folder!,
        gradleBuildFileUri,
        command,
        tasksMap![task]
      )
    );
}

export function getTaskName(task: string, relativePath: string | undefined) {
  if (relativePath && relativePath.length) {
    return `${task} - ${relativePath.substring(0, relativePath.length - 1)}`;
  }
  return task;
}

export function createTask(
  taskDefinition: GradleTaskDefinition | string,
  task: string,
  folder: WorkspaceFolder,
  buildGradleUri: Uri,
  command: string,
  description?: string
): Task {
  let kind: GradleTaskDefinition;
  if (typeof taskDefinition === 'string') {
    kind = { type: 'gradle', task: taskDefinition };
  } else {
    kind = taskDefinition;
  }

  function getCommandLine(task: string): string {
    return `${command} ${task}`;
  }

  function getRelativePath(
    folder: WorkspaceFolder,
    buildGradleUri: Uri
  ): string {
    const rootUri = folder.uri;
    const absolutePath = buildGradleUri.fsPath.substring(
      0,
      buildGradleUri.fsPath.length - 'build.gradle'.length
    );
    return absolutePath.substring(rootUri.fsPath.length + 1);
  }

  const relativeBuildGradle = getRelativePath(folder, buildGradleUri);
  if (relativeBuildGradle.length) {
    kind.path = getRelativePath(folder, buildGradleUri);
  }
  const taskName = getTaskName(kind.task, relativeBuildGradle);
  const cwd = path.dirname(buildGradleUri.fsPath);
  return new Task(
    kind,
    folder,
    taskName,
    'gradle',
    new ShellExecution(getCommandLine(task), { cwd })
  );
}

export async function hasBuildGradle(): Promise<boolean> {
  const folders = workspace.workspaceFolders;
  if (!folders) {
    return false;
  }
  for (const folder of folders) {
    if (folder.uri.scheme === 'file') {
      const buildGradle = path.join(folder.uri.fsPath, 'build.gradle');
      if (await exists(buildGradle)) {
        return true;
      }
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

function findAllTasks(buffer: Buffer | string): StringMap {
  const tasks: StringMap = {};
  let match: RegExpExecArray | null = null;
  while ((match = TASK_REGEX.exec(buffer.toString())) !== null) {
    const [, name, description] = match;
    tasks[name] = description;
  }
  return tasks;
}

function getTasksArgs(): string {
  return workspace.getConfiguration('gradle').get<string>('tasksArgs', '');
}

interface ProcessOutput {
  readonly stdout: string | Buffer;
  readonly stderr: string | Buffer;
}

function exec(
  command: string,
  args?: ReadonlyArray<string>,
  options?: cp.ExecOptions
): Promise<ProcessOutput> {
  let cmd = command;
  if (args && args.length) {
    cmd = `${cmd} ${args.join(' ')}`;
  }
  return cpExec(cmd, options);
}

function getTasksFromGradle(
  command: string,
  folder: WorkspaceFolder
): Promise<ProcessOutput> {
  const statusbar: Disposable = window.setStatusBarMessage(
    'Refreshing gradle tasks'
  );
  const args = ['--console', 'plain', 'tasks'];
  const tasksArgs = getTasksArgs();
  if (tasksArgs) {
    args.push(tasksArgs);
  }
  const { fsPath: cwd } = folder.uri;
  return exec(command, args, { cwd }).finally(() => {
    statusbar.dispose();
  });
}

async function getTasks(
  command: string,
  folder: WorkspaceFolder
): Promise<StringMap | undefined> {
  try {
    const { stdout } = await getTasksFromGradle(command, folder);
    return findAllTasks(stdout);
  } catch (e) {
    throw new Error('Gradle task detection: failed to get tasks');
  }
}
