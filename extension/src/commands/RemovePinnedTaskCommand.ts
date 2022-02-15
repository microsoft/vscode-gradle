import { GradleTasksTreeDataProvider, GradleTaskTreeItem } from "../views";
import { GradleTaskDefinition } from "../tasks";
import { Command } from "./Command";
import { PinnedTasksStore } from "../stores";

export const COMMAND_REMOVE_PINNED_TASK = "gradle.removePinnedTask";

export class RemovePinnedTaskCommand extends Command {
    constructor(
        private pinnedTasksStore: PinnedTasksStore,
        private gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
    ) {
        super();
    }
    async run(treeItem: GradleTaskTreeItem): Promise<void> {
        if (treeItem && treeItem.task) {
            const definition = treeItem.task.definition as GradleTaskDefinition;
            this.pinnedTasksStore.removeEntry(definition.id, definition.args);
            this.gradleTasksTreeDataProvider.refresh();
        }
    }
}
