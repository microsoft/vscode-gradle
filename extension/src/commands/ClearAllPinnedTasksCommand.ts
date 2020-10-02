import { confirmModal } from '../input';
import { PinnedTasksStore } from '../stores';
import { Command } from './Command';

export const COMMAND_CLEAR_ALL_PINNED_TASKS = 'gradle.clearAllPinnedTasks';

export class ClearAllPinnedTasksCommand extends Command {
  constructor(private pinnedTasksStore: PinnedTasksStore) {
    super();
  }
  async run(): Promise<void> {
    if (
      this.pinnedTasksStore.getData().size &&
      (await confirmModal('Are you sure you want to clear the pinned tasks?'))
    ) {
      this.pinnedTasksStore.clear();
    }
  }
}
