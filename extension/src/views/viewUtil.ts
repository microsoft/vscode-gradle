import * as vscode from 'vscode';
import {
  taskTreeItemMap,
  projectTreeItemMap,
  GradleTasksTreeDataProvider,
} from './gradleTasks/GradleTasksTreeDataProvider';
import { logger } from '../logger';
import { BookmarkedTasksTreeDataProvider } from './bookmarkedTasks/BookmarkedTasksTreeDataProvider';
import { JavaDebug } from '../config';
import { isTaskCancelling, isTaskRunning } from '../tasks/taskUtil';
import { GradleTaskTreeItem } from './gradleTasks/GradleTaskTreeItem';
import { TaskArgs } from '../stores/types';
// import { RecentTasksTreeDataProvider } from './recentTasks/RecentTasksTreeDataProvider';

export function treeItemSortCompareFunc(
  a: vscode.TreeItem,
  b: vscode.TreeItem
): number {
  return a.label!.localeCompare(b.label!);
}

export function updateGradleTreeItemStateForTask(
  task: vscode.Task,
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider
  // recentTasksTreeDataProvider: RecentTasksTreeDataProvider
): void {
  const treeItem = taskTreeItemMap.get(task.definition.id);
  if (treeItem) {
    treeItem.setContext();
    gradleTasksTreeDataProvider.refresh(treeItem);
    // recentTasksTreeDataProvider.refresh();
  }
  bookmarkedTasksTreeDataProvider.refresh();
}

export async function focusTaskInGradleTasksTree(
  treeView: vscode.TreeView<vscode.TreeItem>,
  task: vscode.Task
): Promise<void> {
  try {
    const treeItem = taskTreeItemMap.get(task.definition.id);
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

export function getTreeItemState(
  task: vscode.Task,
  javaDebug?: JavaDebug,
  args?: TaskArgs
): string {
  // A task can be running but in a cancelling state
  if (isTaskCancelling(task, args)) {
    return GradleTaskTreeItem.STATE_CANCELLING;
  }
  if (isTaskRunning(task, args)) {
    return GradleTaskTreeItem.STATE_RUNNING;
  }
  return javaDebug && javaDebug.tasks.includes(task.definition.script)
    ? GradleTaskTreeItem.STATE_DEBUG_IDLE
    : GradleTaskTreeItem.STATE_IDLE;
}
