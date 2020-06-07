import { GradleTaskTreeItem } from '../views';
import { runTaskWithArgs } from '../tasks/taskUtil';
import { logger } from '../logger';
export const COMMAND_RUN_TASK_WITH_ARGS = 'gradle.runTaskWithArgs';

export function runTaskWithArgsCommand(treeItem: GradleTaskTreeItem): void {
  if (treeItem && treeItem.task) {
    runTaskWithArgs(treeItem.task, false);
  } else {
    logger.error(
      'Unable to run task with args. TreeItem or TreeItem task not found.'
    );
  }
}
