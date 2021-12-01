import { GradleDaemonTreeItem } from "../views";
import { confirmModal } from "../util/input";
import { logger } from "../logger";
import { Command } from "./Command";
import { GradleClient } from "../client";

export const COMMAND_STOP_DAEMON = "gradle.stopDaemon";

export class StopDaemonCommand extends Command {
    constructor(private client: GradleClient) {
        super();
    }
    async run(treeItem: GradleDaemonTreeItem): Promise<void> {
        if (!(await confirmModal("Are you sure you want to stop the daemon?"))) {
            return;
        }
        const pid = treeItem.pid;
        const stopDaemonReply = await this.client.stopDaemon(pid);
        if (stopDaemonReply) {
            logger.info(stopDaemonReply.getMessage());
        }
    }
}
