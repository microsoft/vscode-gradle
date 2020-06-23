import { GradleTaskTreeItem } from '../views';
import { getTaskExecution, queueRestartTask } from '../tasks/taskUtil';
export const COMMAND_RESTART_TASK = 'gradle.restartTask';

export async function restartTaskCommand(
  treeItem: GradleTaskTreeItem
): Promise<void> {
  if (treeItem && treeItem.task) {
    const taskExecution = getTaskExecution(treeItem.task);
    if (taskExecution) {
      await queueRestartTask(taskExecution.task);
    }
  }
}
