import { GradleDependencyProvider } from "../dependencies/GradleDependencyProvider";
import { ProjectDependencyTreeItem } from "../views/gradleTasks/ProjectDependencyTreeItem";
import { Command } from "./Command";

export const COMMAND_CANCEL_DEPENDENCY_LOADING = "gradle.cancelDependencyLoading";

export class CancelDependencyLoadingCommand extends Command {
    constructor(private readonly gradleDependencyProvider: GradleDependencyProvider) {
        super();
    }

    async run(treeItem: ProjectDependencyTreeItem): Promise<void> {
        await this.gradleDependencyProvider.cancelDependencies(treeItem);
    }
}
