import { DaemonInfo } from '../proto/gradle_pb';

export const DAEMON_STATUS_BUSY = 'BUSY';
export const ICON_LOADING = 'loading.svg';
export const ICON_GRADLE_TASK = 'script.svg';
export const ICON_DAEMON_BUSY = 'circle-filled.svg';
export const ICON_DAEMON_IDLE = 'circle-outline.svg';
export const ICON_DAEMON_STOPPED = 'close.svg';
export const ICON_WARNING = 'warning.svg';

export const DAEMON_ICON_MAP = {
  [DaemonInfo.DaemonStatus.BUSY]: ICON_DAEMON_BUSY,
  [DaemonInfo.DaemonStatus.IDLE]: ICON_DAEMON_IDLE,
  [DaemonInfo.DaemonStatus.STOPPED]: ICON_DAEMON_STOPPED,
  [DaemonInfo.DaemonStatus.STOPPING]: ICON_DAEMON_STOPPED,
  [DaemonInfo.DaemonStatus.CANCELED]: ICON_DAEMON_STOPPED,
};
