import { GradleBuildContentProvider } from "../client/GradleBuildContentProvider";
import { GradleDependencyProvider } from "../dependencies/GradleDependencyProvider";
import { GradleTaskProvider } from "../tasks";
import { GradleTasksTreeDataProvider, RecentTasksTreeDataProvider } from "../views";
import { DefaultProjectsTreeDataProvider } from "../views/defaultProject/DefaultProjectsTreeDataProvider";
import { Command } from "./Command";
export const COMMAND_REFRESH = "gradle.refresh";

export class RefreshCommand extends Command {
    constructor(
        private gradleTaskProvider: GradleTaskProvider,
        private gradleBuildContentProvider: GradleBuildContentProvider,
        private gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
        private recentTasksTreeDataProvider: RecentTasksTreeDataProvider,
        private defaultProjectsTreeDataProvider: DefaultProjectsTreeDataProvider,
        private gradleDependencyProvider: GradleDependencyProvider
    ) {
        super();
    }
    async run(): Promise<void> {
        this.gradleTaskProvider.clearTasksCache();
        this.gradleDependencyProvider.clearCache();
        this.gradleBuildContentProvider.refresh();
        void this.gradleTaskProvider.loadTasks();
        this.gradleTasksTreeDataProvider.refresh();
        this.defaultProjectsTreeDataProvider.refresh();
        this.recentTasksTreeDataProvider.refresh();
    }
}
