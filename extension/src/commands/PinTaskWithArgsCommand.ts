import { GradleTasksTreeDataProvider, GradleTaskTreeItem } from "../views";
import { GradleTaskDefinition } from "../tasks";
import { getTaskArgs } from "../util/input";
import { Command } from "./Command";
import { PinnedTasksStore } from "../stores";

export const COMMAND_PIN_TASK_WITH_ARGS = "gradle.pinTaskWithArgs";

export class PinTaskWithArgsCommand extends Command {
    constructor(
        private pinnedTasksStore: PinnedTasksStore,
        private gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
    ) {
        super();
    }
    async run(treeItem: GradleTaskTreeItem): Promise<void> {
        if (treeItem && treeItem.task) {
            const args = await getTaskArgs();
            if (args) {
                const definition = treeItem.task.definition as GradleTaskDefinition;
                this.pinnedTasksStore.addEntry(definition.id, args);
                this.gradleTasksTreeDataProvider.refresh();
            }
        }
    }
}
