import * as vscode from 'vscode';

import { getConfigFocusTaskInExplorer } from '../config';
import { GradleDaemonsTreeDataProvider } from './GradleDaemonsTreeDataProvider';
import { GradleTasksTreeDataProvider } from './GradleTasksTreeDataProvider';
// import { GradleBookmarkedTasksTreeDataProvider } from './GradleBookmarkedTasksTreeDataProvider';
import { COMMAND_REFRESH } from '../commands';
import { GradleClient } from '../client/GradleClient';
import { isGradleTask } from '../tasks/taskUtil';
import { focusTaskInGradleTasksTree } from './viewUtil';

export function registerGradleViews(
  context: vscode.ExtensionContext,
  client: GradleClient
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
