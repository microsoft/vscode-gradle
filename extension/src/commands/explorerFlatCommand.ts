import { Extension } from '../extension';

export const COMMAND_EXPLORER_FLAT = 'gradle.explorerFlat';

export function explorerFlatCommand(): void {
  Extension.getInstance().getGradleTasksTreeDataProvider().setCollapsed(true);
}
