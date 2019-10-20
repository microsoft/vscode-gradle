import {
  window,
  workspace,
  commands,
  ExtensionContext,
  OutputChannel
} from "vscode";

import ProcessRegistry from "./ProcessRegistry";
import TaskRegistry, { Task } from "./TaskRegistry";
import Gradle from "./Gradle";

let outputChannel: OutputChannel = null;

function gradleKillCommand() {
  ProcessRegistry.killAll();
}

function refreshTasksCommand() {
  return TaskRegistry.refresh().catch(err => {
    window.showErrorMessage(`Unable to refresh gradle tasks: ${err.message}`);
  });
}

async function gradleRunTaskCommand(): Promise<string | void | Error> {
  let tasks: Task[] = TaskRegistry.getTasks();

  if (!tasks.length) {
    return Promise.reject("No tasks found. Try running gradle:refresh");
  }

  const pickedTask: Task = await window.showQuickPick(tasks);
  if (pickedTask) {
    return Gradle.runTask(outputChannel, pickedTask);
  }
}

export async function activate(context: ExtensionContext) {
  outputChannel = window.createOutputChannel("Gradle");

  workspace
    .createFileSystemWatcher("**/build.gradle")
    .onDidChange(refreshTasksCommand);

  await refreshTasksCommand();

  context.subscriptions.push(
    commands.registerCommand("gradle:runtask", gradleRunTaskCommand)
  );
  context.subscriptions.push(
    commands.registerCommand("gradle:kill", gradleKillCommand)
  );
  context.subscriptions.push(
    commands.registerCommand("gradle:refresh", refreshTasksCommand)
  );
}
