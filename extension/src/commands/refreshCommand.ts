import { Extension } from '../extension';
export const COMMAND_REFRESH = 'gradle.refresh';

export async function refreshCommand(): Promise<void> {
  const extension = Extension.getInstance();
  extension.getGradleTaskProvider().clearTasksCache();
  extension.getGradleTasksTreeDataProvider().refresh();
  extension.getPinnedTasksTreeDataProvider().refresh();
  extension.getRecentTasksTreeDataProvider().refresh();
}
