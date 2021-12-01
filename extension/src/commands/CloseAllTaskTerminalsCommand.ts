import { confirmModal } from "../util/input";
import { TaskTerminalsStore } from "../stores";
import { Command } from "./Command";

export const COMMAND_CLOSE_ALL_TASK_TERMINALS = "gradle.closeAllTaskTerminals";

export class CloseAllTaskTerminalsCommand extends Command {
    constructor(private taskTerminalsStore: TaskTerminalsStore) {
        super();
    }
    async run(): Promise<void> {
        if (
            this.taskTerminalsStore.getData().size &&
            (await confirmModal("Are you sure you want to close all task terminals?"))
        ) {
            Array.from(this.taskTerminalsStore.getData().keys()).forEach((key) => {
                const terminalsSet = this.taskTerminalsStore.getItem(key);
                if (terminalsSet) {
                    Array.from(terminalsSet).forEach((terminal) => terminal.dispose());
                }
            });
            this.taskTerminalsStore.clear();
        }
    }
}
