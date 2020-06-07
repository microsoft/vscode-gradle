import { logger } from '../logger';

export const COMMAND_SHOW_LOGS = 'gradle.showLogs';

export function showLogsCommand(): void {
  logger.getChannel()?.show();
}
