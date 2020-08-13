import * as vscode from 'vscode';
import { parseArgsStringToArgv } from 'string-argv';
import { getGradleCommand, getRootProjectFolder } from '../input';
import { GradleRunnerTerminal } from '../terminal';
import { getRunBuildCancellationKey } from '../client/CancellationKeys';
export const COMMAND_RUN_BUILD = 'gradle.runBuild';

export async function runBuildCommand(): Promise<void> {
  const rootProject = await getRootProjectFolder();
  if (!rootProject) {
    return;
  }
  const gradleCommand = await getGradleCommand();
  if (!gradleCommand) {
    return;
  }

  const args: string[] = parseArgsStringToArgv(gradleCommand.trim());
  const cancellationKey = getRunBuildCancellationKey(
    rootProject.getProjectUri().fsPath,
    args
  );
  const terminal = new GradleRunnerTerminal(rootProject, args, cancellationKey);
  const task = new vscode.Task(
    {
      type: 'gradle',
    },
    rootProject.getWorkspaceFolder(),
    gradleCommand,
    'gradle',
    new vscode.CustomExecution(
      async (): Promise<vscode.Pseudoterminal> => terminal
    ),
    ['$gradle']
  );
  task.presentationOptions = {
    showReuseMessage: false,
    clear: true,
    echo: true,
    focus: true,
    panel: vscode.TaskPanelKind.Shared,
    reveal: vscode.TaskRevealKind.Always,
  };
  await vscode.tasks.executeTask(task);
}
