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

function refresh(): Thenable<void> {
  const statusbar: Disposable = window.setStatusBarMessage(
    'Refreshing gradle tasks'
  );
  return Gradle.getTasks().then(
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
  changeHandlers.push(handler);
}

export default { refresh, clear, getTasks, registerChangeHandler };
