import * as vscode from "vscode";
import { confirmModal } from "../util/input";
import { StopDaemonsReply } from "../proto/gradle_pb";
import { logger } from "../logger";
import { Command } from "./Command";
import { RootProjectsStore } from "../stores";
import { GradleClient } from "../client";
export const COMMAND_STOP_DAEMONS = "gradle.stopDaemons";

export class StopDaemonsCommand extends Command {
    constructor(private client: GradleClient, private rootProjectsStore: RootProjectsStore) {
        super();
    }
    async run(): Promise<void> {
        if (
            !vscode.workspace.workspaceFolders ||
            !vscode.workspace.workspaceFolders.length ||
            !(await confirmModal("Are you sure you want to stop the daemons?"))
        ) {
            return;
        }
        const gradleRootFolders = await this.rootProjectsStore.getProjectRootsWithUniqueVersions();
        const promises: Promise<StopDaemonsReply | void>[] = gradleRootFolders.map((rootProject) =>
            this.client.stopDaemons(rootProject.getProjectUri().fsPath)
        );
        const replies = await Promise.all(promises);
        replies.forEach((reply) => {
            if (reply) {
                logger.info(reply.getMessage());
            }
        });
    }
}
