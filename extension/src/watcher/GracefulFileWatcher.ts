import { FileWatcher } from '.';
import { GradleTaskProvider, GradleTaskManager } from '../tasks';

export class GracefulFileWatcher extends FileWatcher {
  constructor(
    protected readonly buildFileGlob: string,
    private readonly gradleTaskProvider: GradleTaskProvider,
    private readonly gradleTaskManager: GradleTaskManager
  ) {
    super(buildFileGlob);
    this.gradleTaskProvider.onDidStartRefresh(() => this.disable());
    this.gradleTaskProvider.onDidStopRefresh(() => this.enable());
    this.gradleTaskManager.onDidStartTask(() => this.disable());
    this.gradleTaskManager.onDidEndAllTasks(() => this.enable());
  }
}
