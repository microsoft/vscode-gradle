import { window, workspace, Disposable, OutputChannel } from 'vscode';

import ProcessRegistry from './ProcessRegistry';
import GradleTask from './GradleTask';
import GradleOutputParser from './GradleOutputParser';

function getCommand(): string {
  return workspace.getConfiguration().get('gradle.useCommand', 'gradlew');
}

function getTasksArgs(): string {
  return workspace.getConfiguration().get('gradle.tasks.args', '');
}

function getTasks(): Promise<GradleTask[]> {
  const cmd = getCommand();
  const args = ['--console', 'plain', 'tasks'].concat(
    getTasksArgs().split(' ')
  );
  const options = { cwd: workspace.rootPath };
  return ProcessRegistry.create(cmd, args, options).then(stdout => {
    return GradleOutputParser.parseTasks(stdout).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  });
}

function runTask(
  task: GradleTask,
  outputChannel: OutputChannel
): Promise<string> {
  const statusbar: Disposable = window.setStatusBarMessage(
    'Running gradle task'
  );
  const cmd = getCommand();
  const args = [task.label];
  const options = { cwd: workspace.rootPath };

  outputChannel.show();
  outputChannel.append(`Running ${cmd} ${task.label}\n`);

  return ProcessRegistry.create(cmd, args, options, outputChannel).finally(
    () => {
      statusbar.dispose();
    }
  );
}

export default { getTasks, runTask };
