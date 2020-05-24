import { DaemonInfo } from '../proto/gradle_tasks_pb';

export const DAEMON_STATUS_BUSY = 'BUSY';
export const ICON_LOADING = 'loading.svg';
export const ICON_GRADLE_TASK = 'script.svg';
export const ICON_BUSY = 'circle-filled.svg';
export const ICON_NOT_BUSY = 'circle-outline.svg';
export const ICON_ISSUE = 'issues.svg';

export const DAEMON_ICON_MAP = {
  [DaemonInfo.DaemonStatus.BUSY]: ICON_BUSY,
  [DaemonInfo.DaemonStatus.IDLE]: ICON_NOT_BUSY,
  [DaemonInfo.DaemonStatus.STOPPED]: ICON_NOT_BUSY,
  [DaemonInfo.DaemonStatus.STOPPING]: ICON_NOT_BUSY,
};
