import { GradleTaskTreeItem } from "../views";
import { getTaskExecution, queueRestartTask } from "../tasks/taskUtil";
import { Command } from "./Command";
import { TaskServerClient } from "../client";
export const COMMAND_RESTART_TASK = "gradle.restartTask";

export class RestartTaskCommand extends Command {
    constructor(private client: TaskServerClient) {
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
