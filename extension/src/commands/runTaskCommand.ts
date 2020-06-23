import { GradleTaskTreeItem } from '../views';
import { runTask } from '../tasks/taskUtil';
export const COMMAND_RUN_TASK = 'gradle.runTask';

export async function runTaskCommand(
  treeItem: GradleTaskTreeItem
): Promise<void> {
  if (treeItem && treeItem.task) {
    await runTask(treeItem.task);
  }
}
