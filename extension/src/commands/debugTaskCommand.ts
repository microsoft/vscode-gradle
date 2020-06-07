import { GradleTaskTreeItem } from '../views';
import { runTask } from '../tasks/taskUtil';
export const COMMAND_DEBUG_TASK = 'gradle.debugTask';

export function debugTaskCommand(
  treeItem: GradleTaskTreeItem,
  args = ''
): void {
  if (treeItem && treeItem.task) {
    runTask(treeItem.task, args, true);
  }
}
