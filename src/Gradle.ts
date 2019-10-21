import { window, workspace, Disposable, OutputChannel } from 'vscode';

import ProcessRegistry from './ProcessRegistry';
import { GradleTask } from './TaskRegistry';

function getCommand(): string {
  return workspace.getConfiguration().get('gradle.useCommand', 'gradlew');
}

function getTasksArgs(): string {
  return workspace.getConfiguration().get('gradle.tasks.args', '');
}

function runTask(
  task: GradleTask,
  outputChannel?: OutputChannel
): Thenable<void> {
  const cmd = `${getCommand()} ${task.label}`;
  const statusbar: Disposable = window.setStatusBarMessage(
    `Running ${cmd}`
  );
  const { rootPath: cwd } = workspace;

  return ProcessRegistry.create(cmd, { cwd }, outputChannel).then(
    () => statusbar.dispose(),
    err => {
      statusbar.dispose();
      return Promise.reject(err);
    }
  );
}

export default { getCommand, getTasksArgs, runTask };
