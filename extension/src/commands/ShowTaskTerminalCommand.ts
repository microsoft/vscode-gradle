import { GradleTaskTreeItem } from "../views";
import { GradleTaskDefinition } from "../tasks";
import { Command } from "./Command";
import { TaskTerminalsStore } from "../stores";

export const COMMAND_SHOW_TASK_TERMINAL = "gradle.showTaskTerminal";

export class ShowTaskTerminalCommand extends Command {
    constructor(private taskTerminalsStore: TaskTerminalsStore) {
        super();
    }
    async run(treeItem: GradleTaskTreeItem): Promise<void> {
        if (treeItem && treeItem.task) {
            const definition = treeItem.task.definition as GradleTaskDefinition;
            const terminalsSet = this.taskTerminalsStore.getItem(definition.id + definition.args);
            if (terminalsSet) {
                const terminals = Array.from(terminalsSet);
                const mostRecentTerminal = terminals.pop();
                if (mostRecentTerminal) {
                    mostRecentTerminal.show();
                }
            }
        }
    }
}
