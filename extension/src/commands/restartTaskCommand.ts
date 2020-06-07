import { GradleTaskTreeItem } from '../views';
import { getTaskExecution, queueRestartTask } from '../tasks/taskUtil';
export const COMMAND_RESTART_TASK = 'gradle.restartTask';

export function restartTaskCommand(treeItem: GradleTaskTreeItem): void {
  if (treeItem && treeItem.task) {
    const taskExecution = getTaskExecution(treeItem.task);
    if (taskExecution) {
      queueRestartTask(taskExecution.task);
    }
  }
}
