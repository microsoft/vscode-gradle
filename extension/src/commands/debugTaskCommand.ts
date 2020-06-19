import { GradleTaskTreeItem } from '../views';
import { runTask } from '../tasks/taskUtil';
export const COMMAND_DEBUG_TASK = 'gradle.debugTask';

export async function debugTaskCommand(
  treeItem: GradleTaskTreeItem,
  args = ''
): Promise<void> {
  if (treeItem && treeItem.task) {
    await runTask(treeItem.task, args, true);
  }
}
