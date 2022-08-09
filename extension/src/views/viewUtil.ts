import * as vscode from "vscode";
import {
    GRADLE_CONTAINER_VIEW,
    TREE_ITEM_STATE_TASK_CANCELLING,
    TREE_ITEM_STATE_TASK_RUNNING,
    TREE_ITEM_STATE_TASK_DEBUG_IDLE,
    TREE_ITEM_STATE_TASK_IDLE,
    TREE_ITEM_STATE_TASK_DEBUG_RUNNING,
    TREE_ITEM_STATE_TASK_PINNED_PREFIX,
} from "./constants";
import { GradleTaskDefinition } from "../tasks";
import { logger } from "../logger";
import { TaskArgs } from "../stores/types";
import { isTaskCancelling, isTaskRunning } from "../tasks/taskUtil";
import {
    GradleTaskTreeItem,
    getGradleTaskTreeItemMap,
    getProjectTreeItemMap,
    getRecentTaskTreeItemMap,
    GradleTasksTreeDataProvider,
    RecentTasksTreeDataProvider,
    getPinnedTaskTreeItemMap,
} from ".";

export function treeItemSortCompareFunc(a: vscode.TreeItem, b: vscode.TreeItem): number {
    return a.label!.toString().localeCompare(b.label!.toString());
}

export function gradleTaskTreeItemSortCompareFunc(a: GradleTaskTreeItem, b: GradleTaskTreeItem): number {
    const definitionA = a.task.definition as GradleTaskDefinition;
    const definitionB = b.task.definition as GradleTaskDefinition;
    const isRootProjectTaskA = definitionA.project === definitionA.rootProject;
    const isRootProjectTaskB = definitionB.project === definitionB.rootProject;
    if (isRootProjectTaskA && !isRootProjectTaskB) {
        return -1;
    }
    if (isRootProjectTaskB && !isRootProjectTaskA) {
        return 1;
    }
    return treeItemSortCompareFunc(a, b);
}

export function getTreeItemForTask(task: vscode.Task): GradleTaskTreeItem | null {
    const definition = task.definition as GradleTaskDefinition;
    const gradleTaskTreeItem = getGradleTaskTreeItemMap().get(definition.id);
    if (gradleTaskTreeItem && gradleTaskTreeItem.task === task) {
        return gradleTaskTreeItem;
    }
    const recentTaskTreeItem = getRecentTaskTreeItemMap().get(definition.id + definition.args);
    if (recentTaskTreeItem && recentTaskTreeItem.task === task) {
        return recentTaskTreeItem;
    }
    return null;
}

export function updateGradleTreeItemStateForTask(
    task: vscode.Task,
    gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
    recentTasksTreeDataProvider: RecentTasksTreeDataProvider
): void {
    const definition = task.definition as GradleTaskDefinition;
    const pinnedTaskTreeItem = getPinnedTaskTreeItemMap().get(definition.id);
    if (pinnedTaskTreeItem) {
        pinnedTaskTreeItem.setContext();
        gradleTasksTreeDataProvider.refresh(pinnedTaskTreeItem);
    }
    const gradleTaskTreeItem = getGradleTaskTreeItemMap().get(definition.id);
    if (gradleTaskTreeItem) {
        gradleTaskTreeItem.setContext();
        gradleTasksTreeDataProvider.refresh(gradleTaskTreeItem);
    }
    const recentTaskTreeItem = getRecentTaskTreeItemMap().get(definition.id + definition.args);
    if (recentTaskTreeItem) {
        recentTaskTreeItem.setContext();
        recentTasksTreeDataProvider.refresh(recentTaskTreeItem);
    }
}

export async function focusTaskInGradleTasksTree(
    task: vscode.Task,
    gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>
): Promise<void> {
    try {
        const definition = task.definition as GradleTaskDefinition;
        const treeItem = getTreeItemForTask(task); // null if running task from command palette
        if (treeItem === null || treeItem.constructor === GradleTaskTreeItem) {
            const gradleTaskTreeItem = getGradleTaskTreeItemMap().get(definition.id);
            if (gradleTaskTreeItem) {
                await gradleTasksTreeView.reveal(gradleTaskTreeItem, {
                    expand: true,
                    select: true,
                    focus: true,
                });
            }
        }
    } catch (err) {
        logger.error("Unable to focus task in explorer:", err.message);
    }
}

export async function focusProjectInGradleTasksTree(
    uri: vscode.Uri,
    gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>
): Promise<void> {
    try {
        await vscode.commands.executeCommand(`workbench.view.extension.${GRADLE_CONTAINER_VIEW}`);
        const treeItem = getProjectTreeItemMap().get(uri.fsPath);
        if (treeItem) {
            await gradleTasksTreeView.reveal(treeItem, {
                focus: true,
                expand: true,
                select: true,
            });
        }
    } catch (err) {
        logger.error("Unable to focus project in explorer:", err.message);
    }
}

function getTreeItemRunningState(task: vscode.Task, args?: TaskArgs): string {
    let state = "";
    const definition = task.definition as GradleTaskDefinition;
    const isDebug = definition.debuggable;
    if (isTaskCancelling(task, args)) {
        return state + TREE_ITEM_STATE_TASK_CANCELLING;
    }
    const isRunning = isTaskRunning(task, args);
    if (definition.isPinned) {
        state += TREE_ITEM_STATE_TASK_PINNED_PREFIX;
    }
    if (isRunning) {
        state += isDebug ? TREE_ITEM_STATE_TASK_DEBUG_RUNNING : TREE_ITEM_STATE_TASK_RUNNING;
        return state;
    }
    state += isDebug ? TREE_ITEM_STATE_TASK_DEBUG_IDLE : TREE_ITEM_STATE_TASK_IDLE;
    return state;
}

export function getTreeItemState(task: vscode.Task, args?: TaskArgs): string {
    const runningState = getTreeItemRunningState(task, args);
    return args ? `${runningState}WithArgs` : runningState;
}
