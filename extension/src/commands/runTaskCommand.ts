import { GradleTaskTreeItem } from '../views';
import { runTask } from '../tasks/taskUtil';
export const COMMAND_RUN_TASK = 'gradle.runTask';

export function runTaskCommand(treeItem: GradleTaskTreeItem): void {
  if (treeItem && treeItem.task) {
    runTask(treeItem.task);
  }
}
