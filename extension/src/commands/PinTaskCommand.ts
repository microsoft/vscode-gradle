import { GradleTaskTreeItem, PinnedTasksTreeDataProvider } from "../views";
import { GradleTaskDefinition } from "../tasks";
import { Command } from "./Command";

export const COMMAND_PIN_TASK = "gradle.pinTask";

export class PinTaskCommand extends Command {
    constructor(private pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider) {
        super();
    }
    async run(treeItem: GradleTaskTreeItem): Promise<void> {
        if (treeItem && treeItem.task) {
            const definition = treeItem.task.definition as GradleTaskDefinition;
            this.pinnedTasksTreeDataProvider.getStore().addEntry(definition.id, definition.args);
        }
    }
}
