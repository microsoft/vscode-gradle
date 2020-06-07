import { Extension } from '../extension';
import { GradleTaskTreeItem } from '../views';
import { GradleTaskDefinition } from '../tasks';

export const COMMAND_PIN_TASK = 'gradle.pinTask';

export function pinTaskCommand(treeItem: GradleTaskTreeItem): void {
  if (treeItem && treeItem.task) {
    const definition = treeItem.task.definition as GradleTaskDefinition;
    Extension.getInstance()
      .getPinnedTasksTreeDataProvider()
      .getStore()
      .addEntry(definition.id, definition.args);
  }
}
