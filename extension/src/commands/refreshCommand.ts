import { Extension } from '../extension';
export const COMMAND_REFRESH = 'gradle.refresh';

export function refreshCommand(): void {
  Extension.getInstance().getGradleTaskProvider().clearTasksCache();
  Extension.getInstance().getGradleTasksTreeDataProvider().refresh();
}
