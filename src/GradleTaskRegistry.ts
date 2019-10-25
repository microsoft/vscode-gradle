import { window, Disposable, QuickPickItem } from 'vscode';

import Gradle from './Gradle';
import GradleTask from './GradleTask';

export default class GradleTaskRegistry {
  private tasks: Set<GradleTask> = new Set();
  private changeHandlers: Array<() => void> = [];

  add(task: GradleTask) {
    this.tasks.add(task);
  }

  dispose() {
    this.tasks.clear();
  }

  getTasks(): GradleTask[] {
    return Array.from(this.tasks);
  }

  refresh(): Promise<void> {
    const statusbar: Disposable = window.setStatusBarMessage(
      'Refreshing gradle tasks'
    );
    return Gradle.getTasks()
      .then(gradleTasks => {
        this.dispose();
        gradleTasks.forEach(task => this.add(task));
        this.changeHandlers.forEach(handler => handler());
      })
      .finally(() => {
        statusbar.dispose();
      });
  }

  registerChangeHandler(handler: () => void) {
    this.changeHandlers.push(handler);
  }
}
