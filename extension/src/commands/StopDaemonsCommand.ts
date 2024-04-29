import * as vscode from "vscode";
import { confirmModal } from "../util/input";
import { logger } from "../logger";
import { Command } from "./Command";
import { RootProjectsStore } from "../stores";
import { getGradleConfig } from "../util/config";
import { GradleStatus } from "../views/gradleDaemons/services/GradleStatus";
import { GradleConnectionType } from "../views/gradleDaemons/models/GradleConnectionType";
import { GradleWrapper } from "../views/gradleDaemons/services/GradleWrapper";
import { GradleLocalInstallation } from "../views/gradleDaemons/services/GradleLocalInstallation";
import { COMMAND_REFRESH_DAEMON_STATUS } from "./RefreshDaemonStatusCommand";

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
            logger.info(`Successfully stopped all daemons.`);
            await vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
        } catch (error) {
            logger.error(`Failed to stop daemons: ${error.message}.`);
        }
    }

    async stopDaemons(projectFolder: string): Promise<void> {
        const gradleConfig = getGradleConfig();
        const connectType = await GradleStatus.getConnectionType(gradleConfig);
        if (connectType === GradleConnectionType.WRAPPER) {
            const gradleExecution = new GradleWrapper(projectFolder);
            await gradleExecution.exec(["--stop"]);
        } else if (connectType === GradleConnectionType.LOCALINSTALLATION) {
            const gradleExecution = new GradleLocalInstallation(gradleConfig.getGradleHome());
            await gradleExecution.exec(["--stop"]);
        } else {
            logger.info("No daemons to stop.");
        }
    }
}
