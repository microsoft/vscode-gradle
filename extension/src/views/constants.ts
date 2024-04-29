import { DaemonStatus } from "./gradleDaemons/models/DaemonStatus";

export const ICON_LOADING = "loading.svg";
export const ICON_GRADLE_TASK = "script.svg";
export const ICON_DAEMON_BUSY = "circle-filled.svg";
export const ICON_DAEMON_IDLE = "circle-outline.svg";
export const ICON_DAEMON_STOPPED = "close.svg";

export const GRADLE_CONTAINER_VIEW = "gradleContainerView";
export const GRADLE_TASKS_VIEW = "gradleTasksView";
export const GRADLE_DEFAULT_PROJECTS_VIEW = "gradleDefaultProjectsView";
export const GRADLE_DAEMONS_VIEW = "gradleDaemonsView";
export const RECENT_TASKS_VIEW = "recentTasksView";

export const TREE_ITEM_STATE_TASK_RUNNING = "runningTask";
export const TREE_ITEM_STATE_TASK_DEBUG_RUNNING = "runningDebugTask";
export const TREE_ITEM_STATE_TASK_CANCELLING = "cancellingTask";
export const TREE_ITEM_STATE_TASK_IDLE = "task";
export const TREE_ITEM_STATE_TASK_DEBUG_IDLE = "debugTask";
export const TREE_ITEM_STATE_TASK_PINNED_PREFIX = "pinned";
export const TREE_ITEM_STATE_NO_TASKS = "notasks";
export const TREE_ITEM_STATE_FOLDER = "folder";

export const TASK_STATE_RUNNING_REGEX = new RegExp(`^${TREE_ITEM_STATE_TASK_RUNNING}`);

export const DAEMON_ICON_MAP = {
    [DaemonStatus.BUSY]: ICON_DAEMON_BUSY,
    [DaemonStatus.IDLE]: ICON_DAEMON_IDLE,
    [DaemonStatus.STOPPED]: ICON_DAEMON_STOPPED,
    [DaemonStatus.STOPPING]: ICON_DAEMON_STOPPED,
    [DaemonStatus.CANCELED]: ICON_DAEMON_STOPPED,
};
