import {
  window,
  workspace,
  commands,
  ExtensionContext,
  OutputChannel
} from 'vscode';

import ProcessRegistry from './ProcessRegistry';
import TaskRegistry from './TaskRegistry';
import GradleTask from './GradleTask';
import Gradle from './Gradle';
import GradleTreeProvider from './GradleNodeProvider';

let outputChannel: OutputChannel;

function gradleKillCommand() {
  ProcessRegistry.killAll();
}

function gradleRefreshTasksCommand(): Thenable<void> {
  return TaskRegistry.refresh().then(undefined, err => {
    window.showErrorMessage(`Unable to refresh gradle tasks: ${err.message}`);
  });
}

async function gradleRunTaskCommand(taskName?: string): Promise<Error | void> {
  if (taskName) {
    return Gradle.runTask(new GradleTask(taskName), outputChannel);
  }

  let tasks: GradleTask[] = TaskRegistry.getTasks();

  if (!tasks.length) {
    return Promise.reject('No tasks found. Try running gradle:refresh');
  }

  const pickedTask: GradleTask | void = await window.showQuickPick(tasks);
  if (pickedTask) {
    return Gradle.runTask(pickedTask, outputChannel);
  }
}

export async function activate(context: ExtensionContext) {
  outputChannel = window.createOutputChannel('Gradle');

  workspace
    .createFileSystemWatcher('/build.gradle')
    .onDidChange(gradleRefreshTasksCommand);

  const explorerEnabled = workspace
    .getConfiguration()
    .get('gradle.enableTasksExplorer');

  await gradleRefreshTasksCommand();

  if (explorerEnabled) {
    const treeProvider: GradleTreeProvider = new GradleTreeProvider(context);
    TaskRegistry.registerChangeHandler(() => treeProvider.refresh());
    window.registerTreeDataProvider('gradleTasks', treeProvider);
  }

  context.subscriptions.push(
    commands.registerCommand('gradle:refresh', gradleRefreshTasksCommand)
  );
  context.subscriptions.push(
    commands.registerCommand('gradle:runtask', gradleRunTaskCommand)
  );
  context.subscriptions.push(
    commands.registerCommand('gradle:kill', gradleKillCommand)
  );

  commands.executeCommand('setContext', 'gradleTasksExtensionActive', true);

  return {
    api: {
      TaskRegistry
    }
  };
}

// this method is called when your extension is deactivated
export function deactivate() {}
