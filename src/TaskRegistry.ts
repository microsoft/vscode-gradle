import {
  window,
  workspace,
  Disposable,
  OutputChannel,
  QuickPickItem
} from 'vscode';

import Gradle from './Gradle';
import ProcessRegistry from './ProcessRegistry';


export class GradleTask implements QuickPickItem {
  label: string;
  description: string | undefined;

  constructor(label: string, description?: string) {
    this.label = label;
    this.description = description;
  }
}

const TASK_REGEX: RegExp = /$\s*([a-z0-9]+)\s-\s(.*)$/gim;
const tasks: Set<GradleTask> = new Set();
const changeHandlers: Array<() => void> = [];

function add(task: GradleTask): void {
  tasks.add(task);
}

function addAll(tasks: GradleTask[]): void {
  tasks.forEach(add);
}

function clear(): void {
  tasks.clear();
}

function getTasks(): GradleTask[] {
  return Array.from(tasks);
}

function getTasksFromGradle(): Thenable<GradleTask[]> {
  const cmd = `${Gradle.getCommand()} --console plain tasks ${Gradle.getTasksArgs()}`;
  const { rootPath: cwd } = workspace;
  return ProcessRegistry.create(cmd, { cwd }).then(stdout => {
    let match: RegExpExecArray | null = null;
    const tasks: GradleTask[] = [];
    while ((match = TASK_REGEX.exec(stdout)) !== null) {
      tasks.push(new GradleTask(match[1], match[2]))
    }
    return tasks.sort((a, b) => a.label.localeCompare(b.label));
  });
}

function refresh(): Thenable<void> {
  const statusbar: Disposable = window.setStatusBarMessage(
    'Refreshing gradle tasks'
  );
  return getTasksFromGradle().then(
    gradleTasks => {
      clear();
      addAll(gradleTasks);
      statusbar.dispose();
      changeHandlers.forEach(handler => handler());
    },
    err => {
      statusbar.dispose();
      return Promise.reject(err);
    }
  );
}

function registerChangeHandler(handler: () => void) {
  changeHandlers.push(handler)
}

export default { refresh, clear, getTasks, registerChangeHandler };
