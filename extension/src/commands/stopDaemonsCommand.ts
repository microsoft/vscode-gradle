import * as vscode from 'vscode';
import { Extension } from '../extension';
import { confirmModal } from '../input';
import { StopDaemonsReply } from '../proto/gradle_pb';
import { logger } from '../logger';
import { COMMAND_REFRESH_DAEMON_STATUS } from './refreshDaemonStatusCommand';
export const COMMAND_STOP_DAEMONS = 'gradle.stopDaemons';

export async function stopDaemonsCommand(): Promise<void> {
  if (
    !vscode.workspace.workspaceFolders ||
    !vscode.workspace.workspaceFolders.length ||
    !(await confirmModal('Are you sure you want to stop the daemons?'))
  ) {
    return;
  }
  try {
    const promises: Promise<StopDaemonsReply | void>[] = vscode.workspace.workspaceFolders.map(
      (folder) =>
        Extension.getInstance().getClient().stopDaemons(folder.uri.fsPath)
    );
    const replies = await Promise.all(promises);
    replies.forEach((reply) => {
      if (reply) {
        logger.info(reply.getMessage());
      }
    });
  } finally {
    vscode.commands.executeCommand(COMMAND_REFRESH_DAEMON_STATUS);
  }
}
