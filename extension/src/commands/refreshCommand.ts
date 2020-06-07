import { invalidateTasksCache } from '../tasks';
import { Extension } from '../extension';
export const COMMAND_REFRESH = 'gradle.refresh';

export function refreshCommand(): void {
  invalidateTasksCache();
  Extension.getInstance().getGradleTasksTreeDataProvider().refresh();
}
