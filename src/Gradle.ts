import { window, workspace, Disposable, OutputChannel } from 'vscode';

import ProcessRegistry from './ProcessRegistry';
import { Task } from './TaskRegistry';

function getCommand(): string {
  return workspace.getConfiguration().get('gradle.useCommand', 'gradlew');
}

function getTasksArgs(): string {
  return workspace
    .getConfiguration()
    .get('gradle.tasks.args', [])
    .join(' ');
}

function runTask(
  outputChannel: OutputChannel,
  task: Task
): Thenable<string | Error> {
  const statusbar: Disposable = window.setStatusBarMessage(
    `Running gradle ${task.label}`
  );
  const cmd = `${getCommand()} ${task.label}`;
  const { rootPath: cwd } = workspace;

  return ProcessRegistry.create(cmd, { cwd }, outputChannel).then(
    () => statusbar.dispose(),
    () => statusbar.dispose()
  );
}

export default { getCommand, getTasksArgs, runTask };
