import { Extension } from '../extension';
import { GradleTaskTreeItem } from '../views';
import { GradleTaskDefinition } from '../tasks';

export const COMMAND_REMOVE_PINNED_TASK = 'gradle.removePinnedTask';

export function removePinnedTaskCommand(treeItem: GradleTaskTreeItem): void {
  if (treeItem && treeItem.task) {
    const definition = treeItem.task.definition as GradleTaskDefinition;
    Extension.getInstance()
      .getPinnedTasksTreeDataProvider()
      .getStore()
      .removeEntry(definition.id, definition.args);
  }
}
