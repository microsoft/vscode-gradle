import { GradleTasksTreeDataProvider } from "../views";
import { Command } from "./Command";

export const COMMAND_EXPLORER_FLAT = "gradle.explorerFlat";

export class ExplorerFlatCommand extends Command {
    constructor(private gradleTasksTreeDataProvider: GradleTasksTreeDataProvider) {
        super();
    }
    async run(): Promise<void> {
        await this.gradleTasksTreeDataProvider.setCollapsed(true);
    }
}
