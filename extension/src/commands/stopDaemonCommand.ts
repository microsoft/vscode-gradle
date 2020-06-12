import { GradleDaemonTreeItem } from '../views';
import { confirmModal } from '../input';
import { Extension } from '../extension';
import { logger } from '../logger';

export const COMMAND_STOP_DAEMON = 'gradle.stopDaemon';

export async function stopDaemonCommand(
  treeItem: GradleDaemonTreeItem
): Promise<void> {
  if (!(await confirmModal('Are you sure you want to stop the daemon?'))) {
    return;
  }
  const pid = treeItem.pid;
  const stopDaemonReply = await Extension.getInstance()
    .getClient()
    .stopDaemon(pid);
  if (stopDaemonReply) {
    logger.info(stopDaemonReply.getMessage());
  }
}
