import { GradleTasksTreeDataProvider } from "../views";
import { Command } from "./Command";

export const COMMAND_EXPLORER_TREE = "gradle.explorerTree";

export class ExplorerTreeCommand extends Command {
    constructor(private gradleTasksTreeDataProvider: GradleTasksTreeDataProvider) {
        super();
    }
    async run(): Promise<void> {
        await this.gradleTasksTreeDataProvider.setCollapsed(false);
    }
}
