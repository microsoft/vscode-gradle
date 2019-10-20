import {
  window,
  workspace,
  Disposable,
  OutputChannel,
  QuickPickItem
} from "vscode";

import Gradle from "./Gradle";
import ProcessRegistry from "./ProcessRegistry";

export interface Task extends QuickPickItem {}

const TASK_REGEX: RegExp = /$\s*([a-z0-9]+)\s-\s(.*)$/gim;
const tasks: Set<Task> = new Set();
let isRefreshing = false;

function add(task: Task): void {
  tasks.add(task);
}

function addAll(tasks: Task[]): void {
  tasks.forEach(add);
}

function clear(): void {
  tasks.clear();
}

function getTasks(): Task[] {
  return Array.from(tasks);
}

function getTasksFromGradle(): Thenable<Task[]> {
  return new Promise((resolve, reject) => {
    const cmd = `${Gradle.getCommand()} --console plain tasks ${Gradle.getTasksArgs()}`;
    const cwd = workspace.rootPath;
    ProcessRegistry.create(cmd, { cwd }, (err, stdout) => {
      if (err) {
        return reject(err);
      }
      let match: RegExpExecArray;
      const tasks: Task[] = [];

      while ((match = TASK_REGEX.exec(stdout.toString())) !== null) {
        tasks.push({
          label: match[1],
          description: match[2]
        });
      }
      return resolve(tasks);
    });
  });
}

async function refresh(): Promise<Error | void> {
  isRefreshing = true;
  const statusbar: Disposable = window.setStatusBarMessage(
    "Refreshing gradle tasks"
  );
  let gradleTasks: Task[];
  try {
    gradleTasks = await getTasksFromGradle();
  } catch (err) {
    statusbar.dispose();
    throw err;
  }

  clear();
  addAll(gradleTasks);
  statusbar.dispose();
}

export default { refresh, clear, getTasks };
