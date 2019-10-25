import {
  window,
  workspace,
  commands,
  ExtensionContext,
  Disposable
} from 'vscode';

import TaskDetector from './TaskDetector';
import GradleNodeProvider from './GradleNodeProvider';
import GradleTaskRegistry from './GradleTaskRegistry';

let detector: TaskDetector;
let treeDataProvider: Disposable;
let taskRegistry: GradleTaskRegistry;

export async function activate(context: ExtensionContext) {
  taskRegistry = new GradleTaskRegistry();

  if (workspace.getConfiguration().get('gradle.enableTasksExplorer')) {
    treeDataProvider = window.registerTreeDataProvider(
      'gradleTasks',
      new GradleNodeProvider(context, taskRegistry)
    );
  }

  detector = new TaskDetector(context, taskRegistry);
  await detector.start();

  commands.executeCommand('setContext', 'gradleTasksExtensionActive', true);

  return {
    api: {
      detector
    }
  };
}

export function deactivate() {
  if (treeDataProvider) {
    treeDataProvider.dispose();
  }
  detector.dispose();
  taskRegistry.dispose();
}
