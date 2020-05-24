import * as vscode from 'vscode';

import { isGradleTask } from './tasks';
import { getConfigFocusTaskInExplorer } from './config';
import { GradleTasksClient } from './client';
import { GradleDaemonsTreeDataProvider } from './views/GradleDaemonsTreeDataProvider';
import {
  GradleTasksTreeDataProvider,
  taskTreeItemMap,
} from './views/GradleTasksTreeDataProvider';
// import { GradleBookmarkedTasksTreeDataProvider } from './views/GradleBookmarkedTasksTreeDataProvider';
import { logger } from './logger';
import { COMMAND_REFRESH } from './commands';

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
      });
    }
  } catch (err) {
    logger.error('Unable to focus task in explorer:', err.message);
  }
}

export function registerGradleViews(
  context: vscode.ExtensionContext,
  client: GradleTasksClient
): {
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider;
  gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider;
  gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>;
} {
  const collapsed = context.workspaceState.get('explorerCollapsed', false);
  const gradleTasksTreeDataProvider = new GradleTasksTreeDataProvider(context);
  gradleTasksTreeDataProvider.setCollapsed(collapsed);
  const gradleTasksTreeView = vscode.window.createTreeView('gradleTasksView', {
    treeDataProvider: gradleTasksTreeDataProvider,
    showCollapseAll: true,
  });
  const gradleDaemonsTreeDataProvider = new GradleDaemonsTreeDataProvider(
    context,
    client
  );
  const gradleDaemonsTreeView = vscode.window.createTreeView(
    'gradleDaemonsView',
    {
      treeDataProvider: gradleDaemonsTreeDataProvider,
      showCollapseAll: false,
    }
  );
  // const gradleBookmarkedTasksTreeView = vscode.window.createTreeView(
  //   'gradleBookmarkedTasksView',
  //   {
  //     treeDataProvider: new GradleBookmarkedTasksTreeDataProvider(context),
  //     showCollapseAll: false,
  //   }
  // );
  context.subscriptions.push(
    gradleTasksTreeView,
    gradleDaemonsTreeView,
    // TODO: move to extension?
    vscode.workspace.onDidChangeConfiguration(
      (event: vscode.ConfigurationChangeEvent) => {
        if (event.affectsConfiguration('gradle.javaDebug')) {
          vscode.commands.executeCommand(COMMAND_REFRESH);
        }
      }
    ),
    vscode.tasks.onDidStartTask(async (event: vscode.TaskStartEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        gradleTasksTreeDataProvider.renderTask(task);
        if (gradleTasksTreeView.visible && getConfigFocusTaskInExplorer()) {
          await focusTaskInGradleTasksTree(gradleTasksTreeView, task);
        }
      }
    }),
    vscode.tasks.onDidEndTask((event: vscode.TaskEndEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        gradleTasksTreeDataProvider.renderTask(task);
      }
    })
  );
  return {
    gradleTasksTreeDataProvider,
    gradleDaemonsTreeDataProvider,
    gradleTasksTreeView,
  };
}
