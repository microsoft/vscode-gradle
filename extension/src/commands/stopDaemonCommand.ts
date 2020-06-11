import * as vscode from 'vscode';
import { GradleDaemonTreeItem } from '../views';
import { confirmModal } from '../input';
import { Extension } from '../extension';
import { logger } from '../logger';
import { COMMAND_REFRESH_DAEMON_STATUS } from '.';

export const COMMAND_STOP_DAEMON = 'gradle.stopDaemon';

export async function stopDaemonCommand(
  treeItem: GradleDaemonTreeItem
): Promise<void> {
  if (!(await confirmModal('Are you sure you want to stop the daemon?'))) {
    return;
  }
  const pid = treeItem.pid;
  try {
    const stopDaemonReply = await Extension.getInstance()
      .getClient()
      .stopDaemon(pid);
    if (stopDaemonReply) {
      logger.info(stopDaemonReply.getMessage());
    }
  } finally {
    vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
  }
}
