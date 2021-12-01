import { GradleTaskTreeItem } from "../views";
import { getTaskExecution, queueRestartTask } from "../tasks/taskUtil";
import { Command } from "./Command";
import { GradleClient } from "../client";
export const COMMAND_RESTART_TASK = "gradle.restartTask";

export class RestartTaskCommand extends Command {
    constructor(private client: GradleClient) {
        super();
    }
    async run(treeItem: GradleTaskTreeItem): Promise<void> {
        if (treeItem && treeItem.task) {
            const taskExecution = getTaskExecution(treeItem.task);
            if (taskExecution) {
                await queueRestartTask(this.client, taskExecution.task);
            }
        }
    }
}
