import * as vscode from "vscode";
import { GradleTaskDefinition } from ".";
import { logger } from "../logger";
import { loadTasksForProjectRoots, resolveTaskFromDefinition } from "./taskUtil";
import { TaskId } from "../stores/types";
import { RootProjectsStore } from "../stores";
import { TaskServerClient } from "../client";
import { EventWaiter } from "../util/EventWaiter";
import { GradleBuildContentProvider } from "../client/GradleBuildContentProvider";

export class GradleTaskProvider implements vscode.TaskProvider, vscode.Disposable {
    private cachedTasks: vscode.Task[] = [];
    private readonly _onDidLoadTasks: vscode.EventEmitter<vscode.Task[]> = new vscode.EventEmitter<vscode.Task[]>();
    private readonly _onDidStartRefresh: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();
    private readonly _onDidStopRefresh: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();

    constructor(
        private readonly rootProjectsStore: RootProjectsStore,
        private readonly client: TaskServerClient,
        private readonly gradleBuildContentProvider: GradleBuildContentProvider
    ) {}

    public readonly onDidLoadTasks: vscode.Event<vscode.Task[]> = this._onDidLoadTasks.event;
    public readonly onDidStartRefresh: vscode.Event<null> = this._onDidStartRefresh.event;
    public readonly onDidStopRefresh: vscode.Event<null> = this._onDidStopRefresh.event;
    private loadTasksPromise?: Promise<vscode.Task[]>;

    private readonly _waitForTasksLoad = new EventWaiter<vscode.Task[]>(this.onDidLoadTasks);
    public readonly waitForTasksLoad = this._waitForTasksLoad.wait;

    public provideTasks(): Promise<vscode.Task[] | undefined> {
        return this.loadTasks();
    }

    public async resolveTask(_task: vscode.Task): Promise<vscode.Task | undefined> {
        const { definition } = _task;
        const gradleTaskDefinition = definition as GradleTaskDefinition;
        const workspaceFolder = _task.scope as vscode.WorkspaceFolder;
        if (!workspaceFolder) {
            logger.error(
                "Unable to provide Gradle task. Invalid workspace folder: ",
                gradleTaskDefinition.workspaceFolder
            );
            return undefined;
        }
        return resolveTaskFromDefinition(gradleTaskDefinition, workspaceFolder, this.client);
    }

    public async loadTasks(): Promise<vscode.Task[]> {
        if (this.loadTasksPromise) {
            return this.loadTasksPromise;
        }
        if (this.cachedTasks.length) {
            return Promise.resolve(this.cachedTasks);
        }
        logger.debug("Refreshing tasks");
        this._onDidStartRefresh.fire(null);
        const folders = await this.rootProjectsStore.getProjectRoots();
        if (!folders.length) {
            this.cachedTasks = [];
            return Promise.resolve(this.cachedTasks);
        }

        this.loadTasksPromise = loadTasksForProjectRoots(this.client, folders, this.gradleBuildContentProvider)
            .then(
                (tasks) => {
                    this.cachedTasks = tasks;
                    logger.info(`Found ${this.cachedTasks.length} tasks`);
                },
                (err) => {
                    logger.error("Unable to refresh tasks:", err.message);
                    this.cachedTasks = [];
                }
            )
            .then(() => this.cachedTasks);

        return this.loadTasksPromise.finally(() => {
            this._onDidLoadTasks.fire(this.cachedTasks);
            this._onDidStopRefresh.fire(null);
            this.loadTasksPromise = undefined;
        });
    }

    public getTasks(): vscode.Task[] {
        return this.cachedTasks;
    }

    public findByTaskId(taskId: TaskId): vscode.Task | void {
        return this.getTasks().find((task: vscode.Task) => {
            return task.definition.id === taskId;
        });
    }

    public clearTasksCache(): void {
        this.cachedTasks = [];
        this._waitForTasksLoad.reset();
    }

    public dispose(): void {
        this._onDidLoadTasks.dispose();
        this._onDidStartRefresh.dispose();
        this._onDidStopRefresh.dispose();
    }
}
