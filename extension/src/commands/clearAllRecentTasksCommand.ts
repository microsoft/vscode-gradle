import { Extension } from '../extension';
import { confirmModal } from '../input';

export const COMMAND_CLEAR_ALL_RECENT_TASKS = 'gradle.clearAllRecentTasks';

export async function clearAllRecentTasksCommand(): Promise<void> {
  const recentTasksStore = Extension.getInstance().getRecentTasksStore();
  if (
    recentTasksStore.getData().size &&
    (await confirmModal('Are you sure you want to clear the recent tasks?'))
  ) {
    recentTasksStore.clear();
  }
}
