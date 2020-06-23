import { Extension } from '../extension';
export const COMMAND_REFRESH = 'gradle.refresh';

export async function refreshCommand(): Promise<void> {
  const extension = Extension.getInstance();
  extension.getGradleTaskProvider().clearTasksCache();
  // Explicitly load tasks as the views might not be visible
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  extension.getGradleTaskProvider().loadTasks();
  extension.getGradleTasksTreeDataProvider().refresh();
  extension.getPinnedTasksTreeDataProvider().refresh();
  extension.getRecentTasksTreeDataProvider().refresh();
}
