import { GradleDaemonTreeItem } from "../views";
import { confirmModal } from "../util/input";
import { logger } from "../logger";
import { Command } from "./Command";
import { execAsync } from "../util/execAsync";
import * as vscode from "vscode";
import { COMMAND_REFRESH_DAEMON_STATUS } from "./RefreshDaemonStatusCommand";

export const COMMAND_STOP_DAEMON = "gradle.stopDaemon";

export class StopDaemonCommand extends Command {
    constructor() {
        super();
    }
    async run(treeItem: GradleDaemonTreeItem): Promise<void> {
        if (!(await confirmModal("Are you sure you want to stop the daemon?"))) {
            return;
        }
        const pid = treeItem.pid;
        try {
            await this.stopDaemon(pid);
            logger.info(`Successfully stopped daemon with PID ${pid}.`);
        } catch (error) {
            logger.error(`Failed to stop daemon with PID ${pid}: ${error.message}.`);
        }
    }

    async stopDaemon(pid: string): Promise<void> {
        if (!pid) {
            throw new Error("PID is required to stop the daemon.");
        }

        const command = process.platform === "win32" ? `taskkill /PID ${pid} /F` : `kill ${pid}`;
        await execAsync(command);
        await vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
    }
}
