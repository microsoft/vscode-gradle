import { Extension } from '../extension';
export const COMMAND_REFRESH_DAEMON_STATUS = 'gradle.refreshDaemonStatus';

export function refreshDaemonStatusCommand(): void {
  Extension.getInstance().getGradleDaemonsTreeDataProvider().refresh();
}
