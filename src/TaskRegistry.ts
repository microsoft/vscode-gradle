import { window, Disposable, QuickPickItem } from 'vscode';

import Gradle from './Gradle';
import GradleTask from './GradleTask';

const tasks: Set<GradleTask> = new Set();
const changeHandlers: Array<() => void> = [];

function add(task: GradleTask) {
  tasks.add(task);
}

function addAll(tasks: GradleTask[]) {
  tasks.forEach(add);
}

function clear() {
  tasks.clear();
}

function getTasks(): GradleTask[] {
  return Array.from(tasks);
}

function refresh(): Promise<void> {
  const statusbar: Disposable = window.setStatusBarMessage(
    'Refreshing gradle tasks'
  );
  return Gradle.getTasks().then(
    gradleTasks => {
      clear();
      addAll(gradleTasks);
      changeHandlers.forEach(handler => handler());
    },
  ).finally(() => {
    statusbar.dispose();
  });
}

function registerChangeHandler(handler: () => void) {
  changeHandlers.push(handler);
}

export default { refresh, clear, getTasks, registerChangeHandler };
