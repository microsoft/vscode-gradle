import {
  window,
  workspace,
  commands,
  ExtensionContext,
  Disposable
} from 'vscode';
import GradleTaskRegistry from './GradleTaskRegistry';
import TaskProvider from './TaskProvider';

export default class TaskDetector {
  private taskProvider: Disposable | undefined;
  changeEvent: Disposable;

  constructor(
    readonly context: ExtensionContext,
    readonly taskRegistry: GradleTaskRegistry
  ) {
    this.changeEvent = workspace
      .createFileSystemWatcher('/build.gradle')
      .onDidChange(() => this.onBuildFileChange());

    this.taskRegistry.registerChangeHandler(() => this.updateProvider());

    context.subscriptions.push(
      commands.registerCommand('gradle:refresh', () => this.refreshTasks())
    );
  }

  start() {
    return this.refreshTasks();
  }

  dispose() {
    if (this.taskProvider) {
      this.taskProvider.dispose();
    }
    this.changeEvent.dispose();
  }

  updateProvider(): void {
    this.taskProvider = workspace.registerTaskProvider(
      'gradle',
      new TaskProvider(this.taskRegistry)
    );
  }

  async refreshTasks(): Promise<void> {
    try {
      if (this.taskProvider) {
        this.taskProvider.dispose();
      }
      await this.taskRegistry.refresh();
    } catch (err) {
      window.showErrorMessage(`Unable to refresh gradle tasks: ${err.message}`);
    }
  }

  private onBuildFileChange() {
    this.refreshTasks();
  }
}
