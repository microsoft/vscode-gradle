import { GradleTaskTreeItem } from '../views';
import { runTaskWithArgs } from '../tasks/taskUtil';
import { logger } from '../logger';
export const COMMAND_DEBUG_TASK_WITH_ARGS = 'gradle.debugTaskWithArgs';

export function debugTaskWithArgsCommand(treeItem: GradleTaskTreeItem): void {
  if (treeItem && treeItem.task) {
    runTaskWithArgs(treeItem.task, true);
  } else {
    logger.error(
      'Unable to debug task with args. TreeItem or TreeItem task not found.'
    );
  }
}
