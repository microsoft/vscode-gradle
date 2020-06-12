import * as vscode from 'vscode';
import { Extension } from '../extension';
import { confirmModal } from '../input';
import { StopDaemonsReply } from '../proto/gradle_pb';
import { logger } from '../logger';
export const COMMAND_STOP_DAEMONS = 'gradle.stopDaemons';

export async function stopDaemonsCommand(): Promise<void> {
  if (
    !vscode.workspace.workspaceFolders ||
    !vscode.workspace.workspaceFolders.length ||
    !(await confirmModal('Are you sure you want to stop the daemons?'))
  ) {
    return;
  }
  const gradleRootFolders = await Extension.getInstance()
    .getGradleProjectsStore()
    .buildAndGetProjectRootsWithUniqueVersions();
  const promises: Promise<StopDaemonsReply | void>[] = gradleRootFolders.map(
    (rootProject) =>
      Extension.getInstance()
        .getClient()
        .stopDaemons(rootProject.getProjectUri().fsPath)
  );
  const replies = await Promise.all(promises);
  replies.forEach((reply) => {
    if (reply) {
      logger.info(reply.getMessage());
    }
  });
}
