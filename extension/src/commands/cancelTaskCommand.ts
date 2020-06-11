import * as vscode from 'vscode';
import { cancelTask } from '../tasks/taskUtil';
import { logger } from '../logger';
export const COMMAND_CANCEL_TASK = 'gradle.cancelTask';

export async function cancelTaskCommand(task: vscode.Task): Promise<void> {
  try {
    await cancelTask(task);
  } catch (e) {
    logger.error('Error cancelling task:', e.message);
  }
}
