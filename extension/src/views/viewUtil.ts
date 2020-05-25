import * as vscode from 'vscode';
import {
  taskTreeItemMap,
  projectTreeItemMap,
} from './GradleTasksTreeDataProvider';
import { logger } from '../logger';

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
    // It could be the case the view container has not been shown,
    // and the following would have no effect
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
