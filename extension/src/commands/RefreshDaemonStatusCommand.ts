import { GradleDaemonsTreeDataProvider } from "../views";
import { Command } from "./Command";
export const COMMAND_REFRESH_DAEMON_STATUS = "gradle.refreshDaemonStatus";

export class RefreshDaemonStatusCommand extends Command {
    constructor(private gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider) {
        super();
    }
    async run(): Promise<void> {
        this.gradleDaemonsTreeDataProvider.refresh();
    }
}
