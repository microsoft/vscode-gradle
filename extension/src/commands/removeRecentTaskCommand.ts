import { Extension } from '../extension';
import { GradleTaskTreeItem } from '../views';
import { GradleTaskDefinition } from '../tasks';

export const COMMAND_REMOVE_RECENT_TASK = 'gradle.removeRecentTask';

export function removeRecentTaskCommand(treeItem: GradleTaskTreeItem): void {
  if (treeItem && treeItem.task) {
    const definition = treeItem.task.definition as GradleTaskDefinition;
    Extension.getInstance()
      .getRecentTasksStore()
      .removeEntry(definition.id, definition.args);
  }
}
