import { Extension } from '../extension';
import { confirmModal } from '../input';

export const COMMAND_CLEAR_ALL_PINNED_TASKS = 'gradle.clearAllPinnedTasks';

export async function clearAllPinnedTasksCommand(): Promise<void> {
  const pinnedTasksStore = Extension.getInstance().getPinnedTasksStore();
  if (
    pinnedTasksStore.getData().size &&
    (await confirmModal('Are you sure you want to clear the pinned tasks?'))
  ) {
    pinnedTasksStore.clear();
  }
}
