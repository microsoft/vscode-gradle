import { Extension } from '../extension';

export const COMMAND_EXPLORER_FLAT = 'gradle.explorerFlat';

export async function explorerFlatCommand(): Promise<void> {
  await Extension.getInstance()
    .getGradleTasksTreeDataProvider()
    .setCollapsed(true);
}
