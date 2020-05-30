import * as vscode from 'vscode';

import { getConfigFocusTaskInExplorer } from '../config';
import { GradleDaemonsTreeDataProvider } from './gradleDaemons/GradleDaemonsTreeDataProvider';
import { GradleTasksTreeDataProvider } from './gradleTasks/GradleTasksTreeDataProvider';
import { isGradleTask } from '../tasks/taskUtil';
import { focusTaskInGradleTasksTree } from './viewUtil';
import { GradleTaskProvider } from '../tasks/GradleTaskProvider';
import { BookmarkedTasksTreeDataProvider } from './bookmarkedTasks/BookmarkedTasksTreeDataProvider';
import { COMMAND_REFRESH, COMMAND_RENDER_TASK } from '../commands/constants';
import { BookmarkedTasksStore } from '../stores/BookmarkedTasksStore';
// import { RecentTasksStore } from '../stores/RecentTasksStore';
// import { RecentTasksTreeDataProvider } from './recentTasks/RecentTasksTreeDataProvider';
// import { TaskTerminalsStore } from '../stores/TaskTerminalsStore';

export function registerGradleViews(
  context: vscode.ExtensionContext,
  gradleTaskProvider: GradleTaskProvider,
  bookmarkedTasksStore: BookmarkedTasksStore
  // recentTasksStore: RecentTasksStore
  // taskTerminalsStore: TaskTerminalsStore
): {
  gradleTasksTreeDataProvider: GradleTasksTreeDataProvider;
  gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider;
  bookmarkedTasksTreeDataProvider: BookmarkedTasksTreeDataProvider;
  // recentTasksTreeDataProvider: RecentTasksTreeDataProvider;
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
    context
  );
  const gradleDaemonsTreeView = vscode.window.createTreeView(
    'gradleDaemonsView',
    {
      treeDataProvider: gradleDaemonsTreeDataProvider,
      showCollapseAll: false,
    }
  );
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

  // const recentTasksTreeDataProvider = new RecentTasksTreeDataProvider(
  //   context,
  //   client,
  //   recentTasksStore,
  //   taskTerminalsStore,
  //   gradleTasksTreeDataProvider
  // );
  // const recentTasksTreeView = vscode.window.createTreeView('recentTasksView', {
  //   treeDataProvider: recentTasksTreeDataProvider,
  //   showCollapseAll: false,
  // });

  context.subscriptions.push(
    gradleTasksTreeView,
    bookmarkedTasksTreeView,
    // recentTasksTreeView,
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
        vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
        if (gradleTasksTreeView.visible && getConfigFocusTaskInExplorer()) {
          await focusTaskInGradleTasksTree(gradleTasksTreeView, task);
        }
      }
    }),
    vscode.tasks.onDidEndTask((event: vscode.TaskEndEvent) => {
      const { task } = event.execution;
      if (isGradleTask(task)) {
        vscode.commands.executeCommand(COMMAND_RENDER_TASK, task);
      }
    })
  );
  return {
    gradleTasksTreeDataProvider,
    gradleDaemonsTreeDataProvider,
    bookmarkedTasksTreeDataProvider,
    // recentTasksTreeDataProvider,
    gradleTasksTreeView,
  };
}
