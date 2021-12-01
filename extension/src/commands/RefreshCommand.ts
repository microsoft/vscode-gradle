import { GradleProjectContentProvider } from "../projectContent/GradleProjectContentProvider";
import { GradleTaskProvider } from "../tasks";
import { GradleTasksTreeDataProvider, PinnedTasksTreeDataProvider, RecentTasksTreeDataProvider } from "../views";
import { Command } from "./Command";
export const COMMAND_REFRESH = "gradle.refresh";

export class RefreshCommand extends Command {
    constructor(
        private gradleTaskProvider: GradleTaskProvider,
        private gradleProjectContentProvider: GradleProjectContentProvider,
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
