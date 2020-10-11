import * as vscode from 'vscode';
import {
  GRADLE_CONTAINER_VIEW,
  TREE_ITEM_STATE_TASK_CANCELLING,
  TREE_ITEM_STATE_TASK_RUNNING,
  TREE_ITEM_STATE_TASK_DEBUG_IDLE,
  TREE_ITEM_STATE_TASK_IDLE,
} from './constants';
import { GradleTaskDefinition } from '../tasks';
import { logger } from '../logger';
import { JavaDebug } from '../util/config';
import { TaskArgs } from '../stores/types';
import { isTaskCancelling, isTaskRunning } from '../tasks/taskUtil';
import {
  GradleTaskTreeItem,
  getGradleTaskTreeItemMap,
  getProjectTreeItemMap,
  getPinnedTasksTreeItemMap,
  getRecentTaskTreeItemMap,
  GradleTasksTreeDataProvider,
  PinnedTasksTreeDataProvider,
  RecentTasksTreeDataProvider,
} from '.';

export function treeItemSortCompareFunc(
  a: vscode.TreeItem,
  b: vscode.TreeItem
): number {
  return a.label!.localeCompare(b.label!);
}

export function gradleTaskTreeItemSortCompareFunc(
  a: GradleTaskTreeItem,
  b: GradleTaskTreeItem
): number {
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

export function getTreeItemForTask(
  task: vscode.Task
): GradleTaskTreeItem | null {
  const definition = task.definition as GradleTaskDefinition;
  const gradleTaskTreeItem = getGradleTaskTreeItemMap().get(definition.id);
  if (gradleTaskTreeItem && gradleTaskTreeItem.task === task) {
    return gradleTaskTreeItem;
  }
  const pinnedTaskTreeItem = getPinnedTasksTreeItemMap().get(
    definition.id + definition.args
  );
  if (pinnedTaskTreeItem && pinnedTaskTreeItem.task === task) {
    return pinnedTaskTreeItem;
  }
  const recentTaskTreeItem = getRecentTaskTreeItemMap().get(
    definition.id + definition.args
  );
  if (recentTaskTreeItem && recentTaskTreeItem.task === task) {
    return recentTaskTreeItem;
  }
  return null;
}

export function updateGradleTreeItemStateForTask(
  task: vscode.Task,
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
  pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider,
  recentTasksTreeDataProvider: RecentTasksTreeDataProvider
): void {
  const definition = task.definition as GradleTaskDefinition;
  const gradleTaskTreeItem = getGradleTaskTreeItemMap().get(definition.id);
  if (gradleTaskTreeItem) {
    gradleTaskTreeItem.setContext();
    gradleTasksTreeDataProvider.refresh(gradleTaskTreeItem);
  }
  const pinTaskTreeItem = getPinnedTasksTreeItemMap().get(
    definition.id + definition.args
  );
  if (pinTaskTreeItem) {
    pinTaskTreeItem.setContext();
    pinnedTasksTreeDataProvider.refresh(pinTaskTreeItem);
  }
  const recentTaskTreeItem = getRecentTaskTreeItemMap().get(
    definition.id + definition.args
  );
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
        });
      }
    }
  } catch (err) {
    logger.error('Unable to focus task in explorer:', err.message);
  }
}

export async function focusProjectInGradleTasksTree(
  uri: vscode.Uri,
  gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>
): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      `workbench.view.extension.${GRADLE_CONTAINER_VIEW}`
    );
    const treeItem = getProjectTreeItemMap().get(uri.fsPath);
    if (treeItem) {
      await gradleTasksTreeView.reveal(treeItem, {
        focus: true,
        expand: true,
        select: true,
      });
    }
  } catch (err) {
    logger.error('Unable to focus project in explorer:', err.message);
  }
}

function getTreeItemRunningState(
  task: vscode.Task,
  javaDebug?: JavaDebug,
  args?: TaskArgs
): string {
  if (isTaskCancelling(task, args)) {
    return TREE_ITEM_STATE_TASK_CANCELLING;
  }
  if (isTaskRunning(task, args)) {
    return TREE_ITEM_STATE_TASK_RUNNING;
  }
  return javaDebug && javaDebug.tasks.includes(task.definition.script)
    ? TREE_ITEM_STATE_TASK_DEBUG_IDLE
    : TREE_ITEM_STATE_TASK_IDLE;
}

export function getTreeItemState(
  task: vscode.Task,
  javaDebug?: JavaDebug,
  args?: TaskArgs
): string {
  const runningState = getTreeItemRunningState(task, javaDebug, args);
  return args ? `${runningState}WithArgs` : runningState;
}
