import { GradleBuildContentProvider } from '../client/GradleBuildContentProvider';
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
    private gradleProjectContentProvider: GradleBuildContentProvider,
    private gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
    private pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider,
    private recentTasksTreeDataProvider: RecentTasksTreeDataProvider
  ) {
    super();
  }
  async run(): Promise<void> {
    this.gradleTaskProvider.clearTasksCache();
    this.gradleProjectContentProvider.refresh();
    void this.gradleTaskProvider.loadTasks();
    this.gradleTasksTreeDataProvider.refresh();
    this.pinnedTasksTreeDataProvider.refresh();
    this.recentTasksTreeDataProvider.refresh();
  }
}
