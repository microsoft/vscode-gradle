import * as vscode from 'vscode';
import {
  TASK_STATE_CANCELLING,
  TASK_STATE_RUNNING,
  TASK_STATE_DEBUG_IDLE,
  TASK_STATE_IDLE,
  GRADLE_CONTAINER_VIEW,
} from './constants';
import {
  gradleTaskTreeItemMap,
  pinnedTasksTreeItemMap,
  recentTasksTreeItemMap,
  projectTreeItemMap,
} from '.';
import { GradleTaskDefinition } from '../tasks';
import { logger } from '../logger';
import { JavaDebug } from '../config';
import { TaskArgs } from '../stores/types';
import { isTaskCancelling, isTaskRunning } from '../tasks/taskUtil';
import { GradleTaskTreeItem } from './gradleTasks';
import { Extension } from '../extension';

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
  const gradleTaskTreeItem = gradleTaskTreeItemMap.get(definition.id);
  if (gradleTaskTreeItem && gradleTaskTreeItem.task === task) {
    return gradleTaskTreeItem;
  }
  const pinnedTaskTreeItem = pinnedTasksTreeItemMap.get(
    definition.id + definition.args
  );
  if (pinnedTaskTreeItem && pinnedTaskTreeItem.task === task) {
    return pinnedTaskTreeItem;
  }
  const recentTaskTreeItem = recentTasksTreeItemMap.get(
    definition.id + definition.args
  );
  if (recentTaskTreeItem && recentTaskTreeItem.task === task) {
    return recentTaskTreeItem;
  }
  return null;
}

export function updateGradleTreeItemStateForTask(task: vscode.Task): void {
  const definition = task.definition as GradleTaskDefinition;
  const gradleTaskTreeItem = gradleTaskTreeItemMap.get(definition.id);
  const extension = Extension.getInstance();
  if (gradleTaskTreeItem) {
    gradleTaskTreeItem.setContext();
    extension.getGradleTasksTreeDataProvider().refresh(gradleTaskTreeItem);
  }
  const pinTaskTreeItem = pinnedTasksTreeItemMap.get(
    definition.id + definition.args
  );
  if (pinTaskTreeItem) {
    pinTaskTreeItem.setContext();
    extension.getPinnedTasksTreeDataProvider().refresh(pinTaskTreeItem);
  }
  const recentTaskTreeItem = recentTasksTreeItemMap.get(
    definition.id + definition.args
  );
  if (recentTaskTreeItem) {
    recentTaskTreeItem.setContext();
    extension.getRecentTasksTreeDataProvider().refresh(recentTaskTreeItem);
  }
}

export async function focusTaskInGradleTasksTree(
  task: vscode.Task
): Promise<void> {
  try {
    const definition = task.definition as GradleTaskDefinition;
    const treeItem = getTreeItemForTask(task); // null if running task from command palette
    if (treeItem === null || treeItem.constructor === GradleTaskTreeItem) {
      const gradleTaskTreeItem = gradleTaskTreeItemMap.get(definition.id);
      if (gradleTaskTreeItem) {
        await Extension.getInstance()
          .getGradleTasksTreeView()
          .reveal(gradleTaskTreeItem, {
            expand: true,
          });
      }
    }
  } catch (err) {
    logger.error('Unable to focus task in explorer:', err.message);
  }
}

export async function focusProjectInGradleTasksTree(
  uri: vscode.Uri
): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      `workbench.view.extension.${GRADLE_CONTAINER_VIEW}`
    );
    const treeItem = projectTreeItemMap.get(uri.fsPath);
    if (treeItem) {
      await Extension.getInstance().getGradleTasksTreeView().reveal(treeItem, {
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
