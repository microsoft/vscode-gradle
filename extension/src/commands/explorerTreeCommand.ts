import { Extension } from '../extension';

export const COMMAND_EXPLORER_TREE = 'gradle.explorerTree';

export async function explorerTreeCommand(): Promise<void> {
  await Extension.getInstance()
    .getGradleTasksTreeDataProvider()
    .setCollapsed(false);
}
