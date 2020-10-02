import { GradleTaskTreeItem, PinnedTasksTreeDataProvider } from '../views';
import { GradleTaskDefinition } from '../tasks';
import { getTaskArgs } from '../input';
import { Command } from './Command';

export const COMMAND_PIN_TASK_WITH_ARGS = 'gradle.pinTaskWithArgs';

export class PinTaskWithArgsCommand extends Command {
  constructor(
    private pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider
  ) {
    super();
  }
  async run(treeItem: GradleTaskTreeItem): Promise<void> {
    if (treeItem && treeItem.task) {
      const args = await getTaskArgs();
      if (args) {
        const definition = treeItem.task.definition as GradleTaskDefinition;
        this.pinnedTasksTreeDataProvider
          .getStore()
          .addEntry(definition.id, args);
      }
    }
  }
}
