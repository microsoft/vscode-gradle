import * as vscode from 'vscode';

import { getConfigFocusTaskInExplorer } from '../config';
import { GradleDaemonsTreeDataProvider } from './gradleDaemons/GradleDaemonsTreeDataProvider';
import { GradleTasksTreeDataProvider } from './gradleTasks/GradleTasksTreeDataProvider';
import { GradleClient } from '../client/GradleClient';
import { isGradleTask } from '../tasks/taskUtil';
import {
  focusTaskInGradleTasksTree,
  updateGradleTreeItemStateForTask,
} from './viewUtil';
import { GradleTaskProvider } from '../tasks/GradleTaskProvider';
import { BookmarkedTasksTreeDataProvider } from './bookmarkedTasks/BookmarkedTasksTreeDataProvider';
import { COMMAND_REFRESH } from '../commands/constants';
import { BookmarkedTasksStore } from '../stores/BookmarkedTasksStore';

export function registerGradleViews(
  context: vscode.ExtensionContext,
  gradleTaskProvider: GradleTaskProvider,
  client: GradleClient
): {
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider;
  gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider;
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider;
  gradleTasksTreeView: vscode.TreeView<vscode.TreeItem>;
} {
  const collapsed = context.workspaceState.get('gradleTasksCollapsed', false);
  const gradleTasksTreeDataProvider = new GradleTasksTreeDataProvider(
    context,
    gradleTaskProvider
  );
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
  const bookmarkedTasksStore = new BookmarkedTasksStore(context);
  const bookmarkedTasksTreeDataProvider = new BookmarkedTasksTreeDataProvider(
    context,
    bookmarkedTasksStore,
    gradleTasksTreeDataProvider
  );
  const bookmarkedTasksTreeView = vscode.window.createTreeView(
    'bookmarkedTasksView',
    {
      treeDataProvider: bookmarkedTasksTreeDataProvider,
      showCollapseAll: false,
    }
  );
  gradleTasksTreeDataProvider.onDidBuildTreeItems(() =>
    bookmarkedTasksTreeDataProvider.refresh()
  );

  context.subscriptions.push(
    gradleTasksTreeView,
    bookmarkedTasksTreeView,
    gradleDaemonsTreeView,
    bookmarkedTasksStore,
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
        updateGradleTreeItemStateForTask(
          task,
          gradleTasksTreeDataProvider,
          bookmarkedTasksTreeDataProvider
        );
        if (gradleTasksTreeView.visible && getConfigFocusTaskInExplorer()) {
          await focusTaskInGradleTasksTree(gradleTasksTreeView, task);
        }
      }
    }),
    vscode.tasks.onDidEndTask((event: vscode.TaskEndEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        updateGradleTreeItemStateForTask(
          task,
          gradleTasksTreeDataProvider,
          bookmarkedTasksTreeDataProvider
        );
      }
    })
  );
  return {
    gradleTasksTreeDataProvider,
    gradleDaemonsTreeDataProvider,
    bookmarkedTasksTreeDataProvider,
    gradleTasksTreeView,
  };
}
