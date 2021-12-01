import * as vscode from "vscode";
import { cancelBuild } from "../tasks/taskUtil";
import { logger } from "../logger";
import { Command } from "./Command";
import { GradleClient } from "../client";
export const COMMAND_CANCEL_BUILD = "gradle.cancelBuild";

export class CancelBuildCommand extends Command {
    constructor(private client: GradleClient) {
        super();
    }
    async run(cancellationKey: string, task?: vscode.Task): Promise<void> {
        try {
            await cancelBuild(this.client, cancellationKey, task);
        } catch (e) {
            logger.error("Error cancelling task:", e.message);
        }
    }
}
