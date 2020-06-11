import { Extension } from '../extension';
import { GradleTaskTreeItem } from '../views';
import { GradleTaskDefinition } from '../tasks';
import { getTaskArgs } from '../input';

export const COMMAND_PIN_TASK_WITH_ARGS = 'gradle.pinTaskWithArgs';

export async function pinTaskWithArgsCommand(
  treeItem: GradleTaskTreeItem
): Promise<void> {
  if (treeItem && treeItem.task) {
    const args = await getTaskArgs();
    if (args) {
      const definition = treeItem.task.definition as GradleTaskDefinition;
      Extension.getInstance()
        .getPinnedTasksTreeDataProvider()
        .getStore()
        .addEntry(definition.id, args);
    }
  }
}
