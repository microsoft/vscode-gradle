import { Extension } from '../extension';
import { confirmModal } from '../input';

export const COMMAND_CLOSE_ALL_TASK_TERMINALS = 'gradle.closeAllTaskTerminals';

export async function closeAllTaskTerminalsCommand(): Promise<void> {
  const taskTerminalsStore = Extension.getInstance().getTaskTerminalsStore();
  if (
    taskTerminalsStore.getData().size &&
    (await confirmModal('Are you sure you want to close all task terminals?'))
  ) {
    Array.from(taskTerminalsStore.getData().keys()).forEach((key) => {
      const terminalsSet = taskTerminalsStore.getItem(key);
      if (terminalsSet) {
        Array.from(terminalsSet).forEach((terminal) => terminal.dispose());
      }
    });
    taskTerminalsStore.clear();
  }
}
