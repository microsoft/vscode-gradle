import * as vscode from 'vscode';
import * as fg from 'fast-glob';

import { GradleTasksClient } from '../client';
import { getConfigIsAutoDetectionEnabled, getGradleConfig } from '../config';
import { logger } from '../logger';
import {
  GradleProject,
  GradleTask,
  GradleBuild,
} from '../proto/gradle_tasks_pb';
import { GradleTaskDefinition } from './GradleTaskDefinition';
import { CustomBuildTaskTerminal } from './CustomBuildTaskTerminal';
import { COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION } from '../commands';

type callback = () => void;
let cachedTasks: vscode.Task[] = [];
const emptyTasks: vscode.Task[] = [];

function getGradleBuildFile(folder: vscode.WorkspaceFolder): string {
  const files = fg.sync('!(*settings){.gradle,.gradle.kts}', {
    onlyFiles: true,
    cwd: folder.uri.fsPath,
    deep: 1,
    absolute: true,
  });
  return files[0];
}

function buildTaskId(
  projectFolder: string,
  script: string,
  project: string
): string {
  return projectFolder + script + project;
}

export function createTaskFromDefinition(
  definition: GradleTaskDefinition,
  workspaceFolder: vscode.WorkspaceFolder,
  projectFolder: vscode.Uri,
  client: GradleTasksClient
): vscode.Task {
  const terminal = new CustomBuildTaskTerminal(
    workspaceFolder,
    client,
    projectFolder.fsPath
  );
  const task = new vscode.Task(
    definition,
    workspaceFolder,
    definition.script,
    'gradle',
    new vscode.CustomExecution(
      async (): Promise<vscode.Pseudoterminal> => terminal
    ),
    ['$gradle']
  );
  task.presentationOptions = {
    showReuseMessage: false,
    clear: true,
    echo: true,
    focus: true,
    panel: vscode.TaskPanelKind.Shared,
    reveal: vscode.TaskRevealKind.Always,
  };
  terminal.setTask(task);
  return task;
}

export function invalidateTasksCache(): void {
  cachedTasks = emptyTasks;
}

export class GradleTaskProvider
  implements vscode.TaskProvider, vscode.Disposable {
  private _onTasksLoaded: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  private _onDidRefreshStart: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private _onDidRefreshStop: vscode.EventEmitter<
    null
  > = new vscode.EventEmitter<null>();
  private waitForLoadedCallbacks: callback[] = [];
  private hasLoaded = false;
  private readonly onTasksLoaded: vscode.Event<null> = this._onTasksLoaded
    .event;
  public onDidRefreshStart: vscode.Event<null> = this._onDidRefreshStart.event;
  public onDidRefreshStop: vscode.Event<null> = this._onDidRefreshStop.event;

  constructor(private readonly client: GradleTasksClient) {
    this.onTasksLoaded(() => {
      if (!this.hasLoaded) {
        this.callWaitForLoadedCallbacks();
        this.hasLoaded = true;
      } else {
        this._onTasksLoaded.dispose();
      }
    });
  }

  async provideTasks(): Promise<vscode.Task[] | undefined> {
    return cachedTasks;
  }

  public waitForLoaded(callback: callback): void {
    this.waitForLoadedCallbacks.push(callback);
    if (this.hasLoaded) {
      this.callWaitForLoadedCallbacks();
    }
  }

  private callWaitForLoadedCallbacks(): void {
    this.waitForLoadedCallbacks.forEach((callback) => callback());
    this.waitForLoadedCallbacks.splice(0);
  }

  public dispose(): void {
    this._onTasksLoaded.dispose();
    this._onDidRefreshStart.dispose();
    this._onDidRefreshStop.dispose();
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
      if (getConfigIsAutoDetectionEnabled(workspaceFolder)) {
        const buildFile = getGradleBuildFile(workspaceFolder);
        if (!buildFile) {
          continue;
        }
        const gradleBuild = await this.getGradleBuild(
          workspaceFolder,
          vscode.Uri.file(buildFile)
        );
        const gradleProject = gradleBuild && gradleBuild.getProject();
        if (gradleProject) {
          allTasks.push(
            ...this.getVSCodeTasksFromGradleProject(
              workspaceFolder,
              workspaceFolder.uri,
              gradleProject
            )
          );
        }
      }
    }
    return allTasks;
  }

  public async refresh(): Promise<vscode.Task[]> {
    logger.debug('Refreshing tasks');
    this._onDidRefreshStart.fire(null);
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      cachedTasks = emptyTasks;
    } else {
      try {
        cachedTasks = await this.refreshTasks(folders);
        logger.info(`Found ${cachedTasks.length} tasks`);
      } catch (err) {
        logger.error('Unable to refresh tasks:', err.message);
        cachedTasks = emptyTasks;
      }
    }
    this._onTasksLoaded.fire(null);
    this._onDidRefreshStop.fire(null);
    return cachedTasks;
  }

  public getTasks(): vscode.Task[] {
    return cachedTasks;
  }

  private async getGradleBuild(
    projectFolder: vscode.WorkspaceFolder,
    buildFile: vscode.Uri
  ): Promise<GradleBuild | void> {
    const build = await this.client?.getBuild(
      projectFolder.uri.fsPath,
      getGradleConfig()
    );
    vscode.commands.executeCommand(
      COMMAND_UPDATE_JAVA_PROJECT_CONFIGURATION,
      buildFile
    );
    return build;
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
            gradleTask.getBuildfile(),
            projectFolder
          )
        )
      );
    } catch (err) {
      logger.error(
        'Unable to generate vscode tasks from gradle tasks:',
        err.message
      );
    }
    gradleProject.getProjectsList().forEach((project) => {
      vsCodeTasks.push(
        ...this.getVSCodeTasksFromGradleProject(
          workspaceFolder,
          projectFolder,
          project
        )
      );
    });
    return vsCodeTasks;
  }

  private createVSCodeTaskFromGradleTask(
    gradleTask: GradleTask,
    workspaceFolder: vscode.WorkspaceFolder,
    rootProject: string,
    buildFile: string,
    projectFolder: vscode.Uri,
    args = '',
    javaDebug = false
  ): vscode.Task {
    const taskPath = gradleTask.getPath();
    const script = taskPath[0] === ':' ? taskPath.substr(1) : taskPath;
    const definition: GradleTaskDefinition = {
      type: 'gradle',
      id: buildTaskId(projectFolder.fsPath, script, gradleTask.getProject()),
      script,
      description: gradleTask.getDescription(),
      group: (gradleTask.getGroup() || 'other').toLowerCase(),
      project: gradleTask.getProject(),
      buildFile: buildFile,
      rootProject,
      projectFolder: projectFolder.fsPath,
      workspaceFolder: workspaceFolder.uri.fsPath,
      args,
      javaDebug,
    };
    return createTaskFromDefinition(
      definition,
      workspaceFolder,
      projectFolder,
      this.client
    );
  }
}
