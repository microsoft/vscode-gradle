import * as vscode from 'vscode';
import { getGradleCommand, getRootProjectFolder } from '../input';
import { RunCommandTerminal } from '../terminal';
export const COMMAND_RUN_COMMAND = 'gradle.runCommand';

export async function runCommandCommand(): Promise<void> {
  const rootProject = await getRootProjectFolder();
  if (!rootProject) {
    return;
  }
  const gradleCommand = await getGradleCommand();
  if (!gradleCommand) {
    return;
  }
  const commandArgs = gradleCommand.split(' ');
  const terminal = new RunCommandTerminal(rootProject);
  terminal.setArgs(commandArgs);
  const task = new vscode.Task(
    {
      type: 'gradlecommand',
    },
    rootProject.getWorkspaceFolder(),
    'gradle ' + gradleCommand,
    'gradlecommand',
    new vscode.CustomExecution(
      async (): Promise<vscode.Pseudoterminal> => terminal
    ),
    ['$gradle']
  );
  task.presentationOptions = {
    showReuseMessage: false,
    clear: true,
    echo: false,
    focus: true,
    panel: vscode.TaskPanelKind.Shared,
    reveal: vscode.TaskRevealKind.Always,
  };
  vscode.tasks.executeTask(task);
}
