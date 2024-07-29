import * as vscode from "vscode";
import * as path from "path";
import { parseArgsStringToArgv } from "string-argv";
import { GradleProject, GradleTask } from "../proto/gradle_pb";
import { TaskArgs } from "../stores/types";
import { GradleTaskDefinition } from ".";
import { GradleRunnerTerminal } from "../terminal";
import { logger } from "../logger";
import {
    getJavaLanguageSupportExtension,
    getJavaDebuggerExtension,
    JAVA_LANGUAGE_EXTENSION_ID,
    JAVA_DEBUGGER_EXTENSION_ID,
    isJavaLanguageSupportExtensionActivated,
} from "../util/compat";
import { getTaskArgs } from "../util/input";
import { COMMAND_RENDER_TASK } from "../commands";
import { RootProject } from "../rootProject/RootProject";
import { getRunTaskCommandCancellationKey } from "../client/CancellationKeys";
import { TaskServerClient } from "../client";
import { RootProjectsStore } from "../stores";
import { getConfigIsAutoDetectionEnabled, getConfigReuseTerminals, getAllowParallelRun } from "../util/config";
import { GradleBuildContentProvider } from "../client/GradleBuildContentProvider";

const cancellingTasks: Map<string, vscode.Task> = new Map();
const restartingTasks: Map<string, vscode.Task> = new Map();

export function getTaskExecution(task: vscode.Task, args?: TaskArgs): vscode.TaskExecution | undefined {
    return vscode.tasks.taskExecutions.find((e) => isTask(e.task, task, args));
}

function isTask(task1: vscode.Task, task2: vscode.Task, args?: TaskArgs): boolean {
    const checkForArgs = args !== undefined;
    return task1.definition.id === task2.definition.id && (!checkForArgs || task1.definition.args === args);
}

export function isGradleTask(task: vscode.Task): boolean {
    return task.definition.type === "gradle";
}

export function getRunningGradleTasks(): vscode.Task[] {
    return vscode.tasks.taskExecutions.filter(({ task }) => isGradleTask(task)).map(({ task }) => task);
}

export function getRunningGradleTask(task: vscode.Task): vscode.Task | void {
    return getRunningGradleTasks().find((runningTask) => isTask(runningTask, task));
}

export function isTaskRunning(task: vscode.Task, args?: TaskArgs): boolean {
    return getTaskExecution(task, args) !== undefined;
}

export async function cancelBuild(
    client: TaskServerClient,
    cancellationKey: string,
    task?: vscode.Task
): Promise<void> {
    if (task && isTaskRunning(task)) {
        cancellingTasks.set(task.definition.id, task);
        await vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
    }
    await client.cancelBuild(cancellationKey, task);
}

export function isTaskCancelling(task: vscode.Task, args?: TaskArgs): boolean {
    const cancellingTask = getCancellingTask(task);
    const checkForArgs = args !== undefined;
    return Boolean(cancellingTask && (!checkForArgs || cancellingTask.definition.args === args));
}

export function isTaskRestarting(task: vscode.Task, args?: TaskArgs): boolean {
    const restartingTask = getRestartingTask(task);
    const checkForArgs = args !== undefined;
    return Boolean(restartingTask && (!checkForArgs || restartingTask.definition.args === args));
}

export function hasRestartingTask(task: vscode.Task): boolean {
    return getRestartingTask(task) !== undefined;
}

export function getCancellingTask(task: vscode.Task): vscode.Task | void {
    return cancellingTasks.get(task.definition.id);
}

export function getRestartingTask(task: vscode.Task): vscode.Task | void {
    return restartingTasks.get(task.definition.id);
}

export async function restartQueuedTask(task: vscode.Task): Promise<void> {
    const restartingTask = getRestartingTask(task);
    if (restartingTask) {
        restartingTasks.delete(restartingTask.definition.id);
        try {
            await vscode.tasks.executeTask(restartingTask);
        } catch (e) {
            logger.error("There was an error starting the task:", e.message);
        }
    }
}

export function removeCancellingTask(task: vscode.Task): void {
    const cancellingTask = getCancellingTask(task);
    if (cancellingTask) {
        cancellingTasks.delete(cancellingTask.definition.id);
        vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
    }
}

export async function queueRestartTask(client: TaskServerClient, task: vscode.Task): Promise<void> {
    if (isTaskRunning(task)) {
        const definition = task.definition as GradleTaskDefinition;
        restartingTasks.set(definition.id, task);
        const cancellationKey = getRunTaskCommandCancellationKey(definition.projectFolder, task.name);
        // Once the task is cancelled it will restart via onDidEndTask
        await cancelBuild(client, cancellationKey, task);
    }
}

export function buildTaskId(projectFolder: string, script: string, project: string): string {
    return projectFolder + script + project;
}

export function buildTaskName(definition: GradleTaskDefinition): string {
    const argsLabel = definition.args ? ` ${definition.args}` : "";
    return `${definition.script}${argsLabel}`;
}

export function createTaskFromDefinition(
    definition: Required<GradleTaskDefinition>,
    rootProject: RootProject,
    client: TaskServerClient,
    useUniqueId = false
): vscode.Task {
    if (getAllowParallelRun() && useUniqueId) {
        // use a random id to distinguish tasks
        definition.id = definition.id + Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    }
    const args = [definition.script].concat(parseArgsStringToArgv(definition.args.trim())).filter(Boolean);
    const taskName = buildTaskName(definition);
    const cancellationKey = getRunTaskCommandCancellationKey(rootProject.getProjectUri().fsPath, definition.script);

    const terminal = new GradleRunnerTerminal(rootProject, args, cancellationKey, client);
    const task = new vscode.Task(
        definition,
        rootProject.getWorkspaceFolder(),
        taskName,
        "gradle",
        new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => terminal),
        ["$gradle"]
    );

    const reuseTerminals = getConfigReuseTerminals();
    let panelKind = vscode.TaskPanelKind.Dedicated;
    if (reuseTerminals === "off") {
        panelKind = vscode.TaskPanelKind.New;
    } else if (reuseTerminals === "all") {
        panelKind = vscode.TaskPanelKind.Shared;
    }
    task.presentationOptions = {
        showReuseMessage: false,
        clear: true,
        echo: true,
        focus: true,
        panel: panelKind,
        reveal: vscode.TaskRevealKind.Always,
    };
    terminal.setTask(task);
    return task;
}

export function resolveTaskFromDefinition(
    definition: Required<GradleTaskDefinition>,
    workspaceFolder: vscode.WorkspaceFolder,
    client: TaskServerClient
): vscode.Task | undefined {
    const taskName = buildTaskName(definition);
    const task = new vscode.Task(
        definition,
        workspaceFolder,
        taskName,
        "gradle",
        new vscode.CustomExecution(
            async (resolvedDefinition: vscode.TaskDefinition): Promise<vscode.Pseudoterminal> => {
                const resolvedTaskDefinition = resolvedDefinition as GradleTaskDefinition;
                const resolvedWorkspaceFolder =
                    vscode.workspace.getWorkspaceFolder(vscode.Uri.file(resolvedTaskDefinition.workspaceFolder)) ||
                    workspaceFolder;
                const rootProject = new RootProject(
                    resolvedWorkspaceFolder,
                    vscode.Uri.file(resolvedTaskDefinition.projectFolder)
                );
                const cancellationKey = getRunTaskCommandCancellationKey(
                    rootProject.getProjectUri().fsPath,
                    definition.script
                );
                const resolvedArgs = [resolvedTaskDefinition.script]
                    .concat(parseArgsStringToArgv(resolvedTaskDefinition.args.trim()))
                    .filter(Boolean);
                const executeTerminal = new GradleRunnerTerminal(rootProject, resolvedArgs, cancellationKey, client);
                executeTerminal.setTask(task);
                return executeTerminal;
            }
        ),
        ["$gradle"]
    );

    const reuseTerminals = getConfigReuseTerminals();
    let panelKind = vscode.TaskPanelKind.Dedicated;
    if (reuseTerminals === "off") {
        panelKind = vscode.TaskPanelKind.New;
    } else if (reuseTerminals === "all") {
        panelKind = vscode.TaskPanelKind.Shared;
    }
    task.presentationOptions = {
        showReuseMessage: false,
        clear: true,
        echo: true,
        focus: true,
        panel: panelKind,
        reveal: vscode.TaskRevealKind.Always,
    };
    return task;
}

function createVSCodeTaskFromGradleTask(
    gradleTask: GradleTask,
    rootProject: RootProject,
    client: TaskServerClient,
    args = ""
): vscode.Task {
    const taskPath = gradleTask.getPath();
    const script = taskPath[0] === ":" ? taskPath.substr(1) : taskPath;
    const definition: Required<GradleTaskDefinition> = {
        type: "gradle",
        id: buildTaskId(rootProject.getProjectUri().fsPath, script, gradleTask.getProject()),
        script,
        description: gradleTask.getDescription(),
        group: (gradleTask.getGroup() || "other").toLowerCase(),
        project: gradleTask.getProject(),
        buildFile: gradleTask.getBuildfile(),
        rootProject: gradleTask.getRootproject(),
        projectFolder: rootProject.getProjectUri().fsPath,
        workspaceFolder: rootProject.getWorkspaceFolder().uri.fsPath,
        debuggable: gradleTask.getDebuggable(),
        args,
        isPinned: false,
        javaDebug: false,
    };
    return createTaskFromDefinition(definition, rootProject, client);
}

export function getVSCodeTasksFromGradleProject(
    rootProject: RootProject,
    gradleProject: GradleProject,
    client: TaskServerClient
): vscode.Task[] {
    let projects: Array<GradleProject> = [gradleProject];
    const vsCodeTasks: vscode.Task[] = [];
    while (projects.length) {
        const project = projects.shift();
        const gradleTasks: GradleTask[] | void = project!.getTasksList();
        for (const gradleTask of gradleTasks) {
            vsCodeTasks.push(createVSCodeTaskFromGradleTask(gradleTask, rootProject, client));
        }
        projects = projects.concat(project!.getProjectsList());
    }

    return vsCodeTasks;
}

export async function loadTasksForProjectRoots(
    client: TaskServerClient,
    rootProjects: ReadonlyArray<RootProject>,
    gradleBuildContentProvider: GradleBuildContentProvider
): Promise<vscode.Task[]> {
    let allTasks: vscode.Task[] = [];
    for (const rootProject of rootProjects) {
        if (getConfigIsAutoDetectionEnabled(rootProject)) {
            const gradleBuild = await gradleBuildContentProvider.getGradleBuild(rootProject);
            const gradleProject = gradleBuild && gradleBuild.getProject();
            if (gradleProject) {
                const vsCodeTasks = getVSCodeTasksFromGradleProject(rootProject, gradleProject, client);
                allTasks = allTasks.concat(vsCodeTasks);
            }
        }
    }
    // detect duplicate task names
    const tasksMap: Map<string, vscode.Task[]> = new Map();
    for (const task of allTasks) {
        if (tasksMap.has(task.name)) {
            tasksMap.get(task.name)!.push(task);
        } else {
            tasksMap.set(task.name, [task]);
        }
    }
    // rename duplicate task names with additional relative path
    for (const tasks of tasksMap.values()) {
        if (tasks.length !== 1) {
            for (const task of tasks) {
                const definition = task.definition as GradleTaskDefinition;
                const relativePath = path.relative(definition.workspaceFolder, definition.projectFolder);
                if (relativePath) {
                    task.name = task.name + ` (${relativePath})`;
                }
            }
        }
    }
    return allTasks;
}

export async function runTask(
    rootProjectsStore: RootProjectsStore,
    task: vscode.Task,
    client: TaskServerClient,
    args = "",
    debug = false
): Promise<void> {
    const isRunning = isTaskRunning(task, args);
    if (!getAllowParallelRun() && isRunning) {
        logger.warn("Unable to run task, task is already running:", task.name);
        return;
    }
    if (debug) {
        const INSTALL_EXTENSIONS = "Install Missing Extensions";
        if (!getJavaLanguageSupportExtension() || !getJavaDebuggerExtension()) {
            const input = await vscode.window.showErrorMessage(
                "The Java Language Support & Debugger extensions are required for debugging.",
                INSTALL_EXTENSIONS
            );
            if (input === INSTALL_EXTENSIONS) {
                await vscode.commands.executeCommand("workbench.extensions.action.showExtensionsWithIds", [
                    JAVA_LANGUAGE_EXTENSION_ID,
                    JAVA_DEBUGGER_EXTENSION_ID,
                ]);
            }
            return;
        } else if (!isJavaLanguageSupportExtensionActivated()) {
            await vscode.window.showErrorMessage("The Java Language Support extension is not activated.");
            return;
        }
    }
    try {
        if (debug || args || getAllowParallelRun()) {
            const clonedTask = cloneTask(rootProjectsStore, task, args, client, debug, isRunning);
            await vscode.tasks.executeTask(clonedTask);
        } else {
            await vscode.tasks.executeTask(task);
        }
    } catch (e) {
        logger.error("There was an error starting the task:", e.message);
    }
}

export async function runTaskWithArgs(
    rootProjectsStore: RootProjectsStore,
    task: vscode.Task,
    client: TaskServerClient,
    debug = false
): Promise<void> {
    const args = await getTaskArgs();
    if (args !== undefined) {
        await runTask(rootProjectsStore, task, client, args, debug);
    } else {
        logger.error("Args not supplied");
    }
}

export function cloneTask(
    rootProjectsStore: RootProjectsStore,
    task: vscode.Task,
    args: string,
    client: TaskServerClient,
    javaDebug = false,
    useUniqueId = false
): vscode.Task {
    const definition: Required<GradleTaskDefinition> = {
        ...(task.definition as GradleTaskDefinition),
        args,
        javaDebug: javaDebug,
    };
    const rootProject = rootProjectsStore.get(definition.projectFolder);
    return createTaskFromDefinition(definition, rootProject!, client, useUniqueId);
}

export function getGradleTasks(): Thenable<vscode.Task[]> {
    return vscode.tasks.fetchTasks({
        type: "gradle",
    });
}
