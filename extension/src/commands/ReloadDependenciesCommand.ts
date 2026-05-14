import { GradleDependencyProvider } from "../dependencies/GradleDependencyProvider";
import { ProjectDependencyTreeItem } from "../views/gradleTasks/ProjectDependencyTreeItem";
import { Command } from "./Command";

export const COMMAND_RELOAD_DEPENDENCIES = "gradle.reloadDependencies";

export class ReloadDependenciesCommand extends Command {
    constructor(private readonly gradleDependencyProvider: GradleDependencyProvider) {
        super();
    }

    async run(treeItem: ProjectDependencyTreeItem): Promise<void> {
        this.gradleDependencyProvider.reloadDependencies(treeItem);
    }
}
