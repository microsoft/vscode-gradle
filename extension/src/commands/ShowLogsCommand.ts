import { logger } from "../logger";
import { Command } from "./Command";

export const COMMAND_SHOW_LOGS = "gradle.showLogs";

export class ShowLogsCommand extends Command {
    async run(): Promise<void> {
        logger.getChannel()?.show();
    }
}
