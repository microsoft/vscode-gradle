import * as vscode from 'vscode';
import {
  TASK_STATE_CANCELLING,
  TASK_STATE_RUNNING,
  TASK_STATE_DEBUG_IDLE,
  TASK_STATE_IDLE,
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

export function treeItemSortCompareFunc(
  a: vscode.TreeItem,
  b: vscode.TreeItem
): number {
  return a.label!.localeCompare(b.label!);
}

export function updateGradleTreeItemStateForTask(
  task: vscode.Task,
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider,
  recentTasksTreeDataProvider: RecentTasksTreeDataProvider,
  updateAll = true
): void {
  const definition = task.definition as GradleTaskDefinition;
  const gradleTaskTreeItem = gradleTaskTreeItemMap.get(definition.id);
  if (gradleTaskTreeItem && gradleTaskTreeItem.task === task) {
    gradleTaskTreeItem.setContext();
    gradleTasksTreeDataProvider.refresh(gradleTaskTreeItem);
  }

  const bookmarkedTaskTreeItem = bookmarkedTasksTreeItemMap.get(
    definition.id + definition.args
  );
  if (
    bookmarkedTaskTreeItem &&
    (updateAll || bookmarkedTaskTreeItem.task === task)
  ) {
    bookmarkedTaskTreeItem.setContext();
    bookmarkedTasksTreeDataProvider.refresh(bookmarkedTaskTreeItem);
  }

  const recentTaskTreeItem = recentTasksTreeItemMap.get(
    definition.id + definition.args
  );
  if (recentTaskTreeItem && (updateAll || recentTaskTreeItem.task === task)) {
    recentTaskTreeItem.setContext();
    recentTasksTreeDataProvider.refresh(recentTaskTreeItem);
  }
}

export async function focusTaskInGradleTasksTree(
  treeView: vscode.TreeView<vscode.TreeItem>,
  task: vscode.Task
): Promise<void> {
  try {
    const treeItem = gradleTaskTreeItemMap.get(task.definition.id);
    if (treeItem) {
      await treeView.reveal(treeItem, {
        expand: true,
      });
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
      'workbench.view.extension.gradleContainerView'
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
  // A task can be running but in a cancelling state
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
