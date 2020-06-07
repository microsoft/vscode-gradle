import { GradleTaskTreeItem } from '../views';
import { Extension } from '../extension';
import { GradleTaskDefinition } from '../tasks';

export const COMMAND_CLOSE_TASK_TERMINALS = 'gradle.closeTaskTerminals';

export function closeTaskTerminalsCommand(treeItem: GradleTaskTreeItem): void {
  if (treeItem && treeItem.task) {
    const definition = treeItem.task.definition as GradleTaskDefinition;
    const taskTerminalsStore = Extension.getInstance().getTaskTerminalsStore();
    const terminalsSet = taskTerminalsStore.getItem(
      definition.id + definition.args
    );
    if (terminalsSet) {
      Array.from(terminalsSet).forEach((terminal) => {
        terminal.dispose();
      });
    }
  }
}
