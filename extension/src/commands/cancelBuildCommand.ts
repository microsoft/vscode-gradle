import * as vscode from 'vscode';
import { cancelBuild } from '../tasks/taskUtil';
import { logger } from '../logger';
export const COMMAND_CANCEL_BUILD = 'gradle.cancelBuild';

export async function cancelBuildCommand(
  cancellationKey: string,
  task?: vscode.Task
): Promise<void> {
  try {
    await cancelBuild(cancellationKey, task);
  } catch (e) {
    logger.error('Error cancelling task:', e.message);
  }
}
