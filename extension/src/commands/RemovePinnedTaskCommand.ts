import { GradleTaskTreeItem, PinnedTasksTreeDataProvider } from '../views';
import { GradleTaskDefinition } from '../tasks';
import { Command } from './Command';

export const COMMAND_REMOVE_PINNED_TASK = 'gradle.removePinnedTask';

export class RemovePinnedTaskCommand extends Command {
  constructor(
    private pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider
  ) {
    super();
  }
  async run(treeItem: GradleTaskTreeItem): Promise<void> {
    if (treeItem && treeItem.task) {
      const definition = treeItem.task.definition as GradleTaskDefinition;
      this.pinnedTasksTreeDataProvider
        .getStore()
        .removeEntry(definition.id, definition.args);
    }
  }
}
