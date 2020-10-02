import { GradleTaskProvider } from '../tasks';
import {
  GradleTasksTreeDataProvider,
  PinnedTasksTreeDataProvider,
  RecentTasksTreeDataProvider,
} from '../views';
import { Command } from './Command';
export const COMMAND_REFRESH = 'gradle.refresh';

export class RefreshCommand extends Command {
  constructor(
    private gradleTaskProvider: GradleTaskProvider,
    private gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
    private pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider,
    private recentTasksTreeDataProvider: RecentTasksTreeDataProvider
  ) {
    super();
  }
  async run(): Promise<void> {
    this.gradleTaskProvider.clearTasksCache();
    // Explicitly load tasks as the views might not be visible
    void this.gradleTaskProvider.loadTasks();
    this.gradleTasksTreeDataProvider.refresh();
    this.pinnedTasksTreeDataProvider.refresh();
    this.recentTasksTreeDataProvider.refresh();
  }
}
