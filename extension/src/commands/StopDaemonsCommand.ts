import * as vscode from "vscode";
import { confirmModal } from "../util/input";
import { logger } from "../logger";
import { Command } from "./Command";
import { RootProjectsStore } from "../stores";
import { getGradleConfig } from "../util/config";
import { GradleStatus, ConnectionType } from "../views/gradleDaemons/services/GradleStatus";
import { GradleWrapper } from "../views/gradleDaemons/services/GradleWrapper";
import { GradleLocalInstallation } from "../views/gradleDaemons/services/GradleLocalInstallation";
import { COMMAND_REFRESH_DAEMON_STATUS } from "../../src/commands";

export const COMMAND_STOP_DAEMONS = "gradle.stopDaemons";

export class StopDaemonsCommand extends Command {
    constructor(private rootProjectsStore: RootProjectsStore) {
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
        try {
            const promises: Promise<void>[] = gradleRootFolders.map((rootProject) =>
                this.stopDaemons(rootProject.getProjectUri().fsPath)
            );
            await Promise.all(promises);
            await vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
            logger.info(`Successfully stopped all daemons`);
        } catch (error) {
            logger.error(`Failed to stop daemons: ${error.message}`);
        }


    }

    async stopDaemons(projectFolder: string): Promise<void> {
        const gradleConfig = getGradleConfig();
        const connectType = await GradleStatus.getConnectionType(gradleConfig);
        if (connectType === ConnectionType.WRAPPER) {
            const gradleExecution = new GradleWrapper(projectFolder);
            await gradleExecution.exec(["--stop"]);
        } else if (connectType === ConnectionType.LOCALINSTALLATION) {
            const gradleExecution = new GradleLocalInstallation(gradleConfig.getGradleHome());
            await gradleExecution.exec(["--stop"]);
        } else {
            throw new Error("Not implemented yet");
        }
    }
}
