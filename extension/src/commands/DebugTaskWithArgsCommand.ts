import { GradleTaskTreeItem } from "../views";
import { runTaskWithArgs } from "../tasks/taskUtil";
import { logger } from "../logger";
import { Command } from "./Command";
import { RootProjectsStore } from "../stores";
import { GradleClient } from "../client";
export const COMMAND_DEBUG_TASK_WITH_ARGS = "gradle.debugTaskWithArgs";

export class DebugTaskWithArgsCommand extends Command {
    constructor(private rootProjectsStore: RootProjectsStore, private client: GradleClient) {
        super();
    }
    async run(treeItem: GradleTaskTreeItem): Promise<void> {
        if (treeItem && treeItem.task) {
            await runTaskWithArgs(this.rootProjectsStore, treeItem.task, this.client, true);
        } else {
            logger.error("Unable to debug task with args. TreeItem or TreeItem task not found.");
        }
    }
}
