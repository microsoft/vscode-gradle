import { Extension } from '../extension';

export const COMMAND_EXPLORER_TREE = 'gradle.explorerTree';

export function explorerTreeCommand(): void {
  Extension.getInstance().getGradleTasksTreeDataProvider().setCollapsed(false);
}
