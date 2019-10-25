import {
  window,
  workspace,
  Disposable,
  ShellExecution,
  TaskDefinition,
  OutputChannel,
  ShellQuotedString
} from 'vscode';

import GradleTask from './GradleTask';
import GradleOutputParser from './GradleOutputParser';
import Process from './Process';

function getCommand(): string {
  return workspace.getConfiguration().get('gradle.useCommand', 'gradlew');
}

function getTasksArgs(): string {
  return workspace.getConfiguration().get('gradle.tasks.args', '');
}

function getTasks(): Promise<GradleTask[]> {
  const args = ['--console', 'plain', 'tasks'].concat(
    getTasksArgs().split(' ')
  );
  const options = { cwd: workspace.rootPath };
  return new Process(getCommand(), args, options).spawn().then(stdout => {
    return GradleOutputParser.parseTasks(stdout).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  });
}

function buildRunTaskExecution(taskDefinition: TaskDefinition) {
  return new ShellExecution(getCommand(), [taskDefinition.name], {
    cwd: workspace.rootPath
  });
}

export default { getTasks, buildRunTaskExecution };
