import { GradleTaskTreeItem } from '../views';
import { Extension } from '../extension';
import { GradleTaskDefinition } from '../tasks';

export const COMMAND_SHOW_TASK_TERMINAL = 'gradle.showTaskTerminal';

export function showTaskTerminalCommand(treeItem: GradleTaskTreeItem): void {
  if (treeItem && treeItem.task) {
    const definition = treeItem.task.definition as GradleTaskDefinition;
    const terminalsSet = Extension.getInstance()
      .getTaskTerminalsStore()
      .getItem(definition.id + definition.args);
    if (terminalsSet) {
      const terminals = Array.from(terminalsSet);
      const mostRecentTerminal = terminals.pop();
      if (mostRecentTerminal) {
        mostRecentTerminal.show();
      }
    }
  }
}
