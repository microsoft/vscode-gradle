import { window, workspace, Disposable, OutputChannel } from "vscode";

import ProcessRegistry from "./ProcessRegistry";
import { Task } from "./TaskRegistry";

function getCommand(): string {
  return workspace.getConfiguration().get("gradle.useCommand", "gradlew");
}

function getTasksArgs(): string {
  return workspace
    .getConfiguration()
    .get("gradle.tasks.args", [])
    .join(" ");
}

function runTask(
  outputChannel: OutputChannel,
  task: Task
): Thenable<void | Error> {
  return new Promise((resolve, reject) => {
    const statusbar: Disposable = window.setStatusBarMessage(
      `Running gradle ${task.label}`
    );
    const cmd = `${getCommand()} ${task.label}`;
    const { rootPath: cwd } = workspace;
    const process = ProcessRegistry.create(cmd, { cwd }, err => {
      statusbar.dispose();
      return err ? reject(err) : resolve();
    });
    ProcessRegistry.writeOutput(process, outputChannel);
  });
}

export default { getCommand, getTasksArgs, runTask };
