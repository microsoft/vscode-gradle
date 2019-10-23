import { window, workspace, Disposable, OutputChannel } from 'vscode';

import ProcessRegistry from './ProcessRegistry';
import GradleTask from './GradleTask';

const TASK_REGEX: RegExp = /$\s*([a-z0-9]+)\s-\s(.*)$/gim;

function getCommand(): string {
  return workspace.getConfiguration().get('gradle.useCommand', 'gradlew');
}

function getTasksArgs(): string {
  return workspace.getConfiguration().get('gradle.tasks.args', '');
}

function getTasks(): Thenable<GradleTask[]> {
  const cmd = getCommand();
  const args = ['--console', 'plain', 'tasks'].concat(
    getTasksArgs().split(' ')
  );
  const options = { cwd: workspace.rootPath };
  return ProcessRegistry.create(cmd, args, options).then(stdout => {
    let match: RegExpExecArray | null = null;
    const tasks: GradleTask[] = [];
    while ((match = TASK_REGEX.exec(stdout)) !== null) {
      tasks.push(new GradleTask(match[1], match[2]));
    }
    return tasks.sort((a, b) => a.label.localeCompare(b.label));
  });
}

function runTask(
  task: GradleTask,
  outputChannel: OutputChannel
): Thenable<void> {
  const cmd = getCommand();
  const args = [task.label];
  const options = { cwd: workspace.rootPath };
  const statusbar: Disposable = window.setStatusBarMessage(
    'Running gradle task'
  );

  outputChannel.show();
  outputChannel.append(`Running ${cmd} ${task.label}\n`);

  return ProcessRegistry.create(cmd, args, options, outputChannel).then(
    () => statusbar.dispose(),
    err => {
      statusbar.dispose();
      return Promise.reject(err);
    }
  );
}

export default { getTasks, runTask };
