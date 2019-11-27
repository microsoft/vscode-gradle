import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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
  buildFile: string;
};

export interface GradleTaskDefinition extends vscode.TaskDefinition {
  script: string;
  description: string;
  group: string;
  project: string;
  rootProject: string;
  buildFile: string;
}

let autoDetectOverride: boolean = false;
let cachedTasks: Promise<vscode.Task[]> | undefined;
let refreshProcess: cp.ChildProcessWithoutNullStreams | undefined;

export function enableTaskDetection() {
  autoDetectOverride = true;
}

export function killRefreshProcess() {
  if (refreshProcess) {
    refreshProcess.kill();
  }
}

async function isGradleProject(
  folder: vscode.WorkspaceFolder
): Promise<boolean> {
  const defaultBuildFileGlob = '{*.gradle,*.gradle.kts}';
  const relativePattern = new vscode.RelativePattern(
    folder,
    defaultBuildFileGlob
  );
  const files = await vscode.workspace.findFiles(relativePattern);
  return files.length > 0;
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
      const message = `Error providing gradle tasks: ${e.message}`;
      console.error(message);
      this.outputChannel.appendLine(message);
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
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return emptyTasks;
    }
    try {
      for (const folder of folders) {
        if (autoDetectOverride || getIsAutoDetectionEnabled(folder)) {
          if (await isGradleProject(folder)) {
            const tasks = await this.provideGradleTasksForFolder(folder);
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
    folder: vscode.WorkspaceFolder
  ): Promise<vscode.Task[]> {
    const emptyTasks: vscode.Task[] = [];

    const command = await getGradleWrapperCommandFromPath(folder.uri.fsPath);
    if (!command) {
      return emptyTasks;
    }
    const gradleProjects:
      | GradleProject[]
      | undefined = await this.getGradleProjects(folder);
    if (!gradleProjects || !gradleProjects.length) {
      return emptyTasks;
    }

    const rootProject: GradleProject | undefined = gradleProjects.find(
      project => !project.parent
    );
    if (!rootProject) {
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
            vscode.Uri.file(gradleProject.buildFile)
          )
        );
      }
    }

    return tasks;
  }

  private async getProjectsFromGradle(
    folder: vscode.WorkspaceFolder
  ): Promise<string> {
    this.statusBarItem.text = '$(sync~spin) Refreshing gradle tasks';
    this.statusBarItem.show();
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'vscode-gradle-')
    );
    const tempFile = path.join(tempDir, 'tasks.json');
    const command = getTasksScriptCommand();
    const cwd = this.context.asAbsolutePath('lib');
    const args = [folder.uri.fsPath, tempFile];
    return spawn(command, args, { cwd }, this.outputChannel)
      .then(() => fs.promises.readFile(tempFile, 'utf8'))
      .finally(async () => {
        this.statusBarItem.hide();
        if (await exists(tempFile)) {
          await fs.promises.unlink(tempFile);
        }
        await fs.promises.rmdir(tempDir);
      });
  }

  private async getGradleProjects(
    folder: vscode.WorkspaceFolder
  ): Promise<GradleProject[] | undefined> {
    const stdout = await this.getProjectsFromGradle(folder);
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

export async function createTask(
  gradleTask: GradleTask,
  folder: vscode.WorkspaceFolder,
  command: string,
  rootProject: string,
  buildFile: vscode.Uri
): Promise<vscode.Task> {
  function getCommandLine(task: string): string {
    return `"${command}" ${task}`;
  }

  const friendlyTaskName = gradleTask.path.replace(/^:/, '');
  const definition: GradleTaskDefinition = {
    type: 'gradle',
    script: friendlyTaskName,
    description: gradleTask.description,
    group: (gradleTask.group || 'other').toLowerCase(),
    project: gradleTask.project,
    buildFile: buildFile.fsPath,
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

export async function hasGradleProject(): Promise<boolean> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) {
    return false;
  }
  for (const folder of folders) {
    if (folder.uri.scheme !== 'file') {
      continue;
    }
    if (await isGradleProject(folder)) {
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

function debugCommand(
  command: string,
  args: ReadonlyArray<string>,
  options: cp.SpawnOptionsWithoutStdio,
  outputChannel: vscode.OutputChannel
) {
  const message = `Executing: ${command} ${args.join(' ')}`;
  outputChannel.appendLine(message);
}

export function spawn(
  command: string,
  args: ReadonlyArray<string> = [],
  options: cp.SpawnOptionsWithoutStdio = {},
  outputChannel: vscode.OutputChannel
): Promise<string> {
  debugCommand(command, args, options, outputChannel);
  return new Promise((resolve, reject) => {
    refreshProcess = cp.spawn(command, args, options);
    refreshProcess.stdout.on('data', (buffer: Buffer) =>
      outputChannel.append(buffer.toString())
    );
    refreshProcess.stderr.on('data', (buffer: Buffer) =>
      outputChannel.append(buffer.toString())
    );
    refreshProcess.on('error', reject);
    refreshProcess.on('exit', (code: number) => {
      if (code === 0) {
        resolve();
      } else {
        reject();
      }
    });
  });
}
