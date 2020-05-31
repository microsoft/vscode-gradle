import * as vscode from 'vscode';
import {
  TASK_STATE_CANCELLING,
  TASK_STATE_RUNNING,
  TASK_STATE_DEBUG_IDLE,
  TASK_STATE_IDLE,
  GRADLE_CONTAINER_VIEW,
} from './constants';
import {
  GradleTasksTreeDataProvider,
  BookmarkedTasksTreeDataProvider,
  RecentTasksTreeDataProvider,
  gradleTaskTreeItemMap,
  bookmarkedTasksTreeItemMap,
  recentTasksTreeItemMap,
  projectTreeItemMap,
} from '.';
import { GradleTaskDefinition } from '../tasks';
import { logger } from '../logger';
import { JavaDebug } from '../config';
import { TaskArgs } from '../stores/types';
import { isTaskCancelling, isTaskRunning } from '../tasks/taskUtil';
import { GradleTaskTreeItem } from './gradleTasks';

export function treeItemSortCompareFunc(
  a: vscode.TreeItem,
  b: vscode.TreeItem
): number {
  return a.label!.localeCompare(b.label!);
}

export function getTreeItemForTask(
  task: vscode.Task
): GradleTaskTreeItem | null {
  const definition = task.definition as GradleTaskDefinition;
  const gradleTaskTreeItem = gradleTaskTreeItemMap.get(definition.id);
  if (gradleTaskTreeItem && gradleTaskTreeItem.task === task) {
    return gradleTaskTreeItem;
  }
  const bookmarkedTaskTreeItem = bookmarkedTasksTreeItemMap.get(
    definition.id + definition.args
  );
  if (bookmarkedTaskTreeItem && bookmarkedTaskTreeItem.task === task) {
    return bookmarkedTaskTreeItem;
  }
  const recentTaskTreeItem = recentTasksTreeItemMap.get(
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
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider,
  recentTasksTreeDataProvider: RecentTasksTreeDataProvider
): void {
  const definition = task.definition as GradleTaskDefinition;
  const gradleTaskTreeItem = gradleTaskTreeItemMap.get(definition.id);
  if (gradleTaskTreeItem) {
    gradleTaskTreeItem?.setContext();
    gradleTasksTreeDataProvider.refresh(gradleTaskTreeItem);
  }
  const bookmarkTaskTreeItem = bookmarkedTasksTreeItemMap.get(
    definition.id + definition.args
  );
  if (bookmarkTaskTreeItem) {
    bookmarkTaskTreeItem.setContext();
    bookmarkedTasksTreeDataProvider.refresh(bookmarkTaskTreeItem);
  }
  const recentTaskTreeItem = recentTasksTreeItemMap.get(
    definition.id + definition.args
  );
  if (recentTaskTreeItem) {
    recentTaskTreeItem.setContext();
    recentTasksTreeDataProvider.refresh(recentTaskTreeItem);
  }
}

export async function focusTaskInGradleTasksTree(
  treeView: vscode.TreeView<vscode.TreeItem>,
  task: vscode.Task
): Promise<void> {
  try {
    const definition = task.definition as GradleTaskDefinition;
    const treeItem = getTreeItemForTask(task); // null if running task from command palette
    if (treeItem === null || treeItem.constructor === GradleTaskTreeItem) {
      const gradleTaskTreeItem = gradleTaskTreeItemMap.get(definition.id);
      if (gradleTaskTreeItem) {
        await treeView.reveal(gradleTaskTreeItem, {
          expand: true,
        });
      }
    }
  } catch (err) {
    logger.error('Unable to focus task in explorer:', err.message);
  }
}

export async function focusProjectInGradleTasksTree(
  treeView: vscode.TreeView<vscode.TreeItem>,
  uri: vscode.Uri
): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      `workbench.view.extension.${GRADLE_CONTAINER_VIEW}`
    );
    const treeItem = projectTreeItemMap.get(uri.fsPath);
    if (treeItem) {
      await treeView.reveal(treeItem, {
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
    return TASK_STATE_CANCELLING;
  }
  if (isTaskRunning(task, args)) {
    return TASK_STATE_RUNNING;
  }
  return javaDebug && javaDebug.tasks.includes(task.definition.script)
    ? TASK_STATE_DEBUG_IDLE
    : TASK_STATE_IDLE;
}

export function getTreeItemState(
  task: vscode.Task,
  javaDebug?: JavaDebug,
  args?: TaskArgs
): string {
  const runningState = getTreeItemRunningState(task, javaDebug, args);
  return args ? `${runningState}WithArgs` : runningState;
}
