import * as vscode from 'vscode';
import {
  taskTreeItemMap,
  projectTreeItemMap,
  GradleTasksTreeDataProvider,
} from './gradleTasks/GradleTasksTreeDataProvider';
import { logger } from '../logger';
import { BookmarkedTasksTreeDataProvider } from './bookmarkedTasks/BookmarkedTasksTreeDataProvider';

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
): void {
  const treeItem = taskTreeItemMap.get(task.definition.id);
  if (treeItem) {
    treeItem.setContext();
    gradleTasksTreeDataProvider.refresh(treeItem);
    bookmarkedTasksTreeDataProvider.refresh();
  }
}

export async function focusTaskInGradleTasksTree(
  treeView: vscode.TreeView<vscode.TreeItem>,
  task: vscode.Task
): Promise<void> {
  try {
    const treeItem = taskTreeItemMap.get(task.definition.id);
    if (treeItem) {
      await treeView.reveal(treeItem, {
        focus: true,
        expand: true,
        select: false,
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
