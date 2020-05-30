import * as vscode from 'vscode';
import { StoreSet } from './StoreSet';
import { TaskId, TaskArgs } from './types';

export interface TaskWithTerminal {
  terminal: vscode.Terminal;
  args: TaskArgs;
}

export class TaskTerminalsStore extends StoreSet<TaskId, TaskWithTerminal> {
  removeTerminal(terminal: vscode.Terminal): void {
    Array.from(this.getData().keys()).forEach((key) => {
      const itemSet = this.getItem(key);
      if (itemSet) {
        Array.from(itemSet).forEach((taskWithTerminal) => {
          if (taskWithTerminal.terminal === terminal) {
            itemSet.delete(taskWithTerminal);
          }
        });
      }
    });
    // Don't call fireOnDidChange() here as there could be many terminals being closed/removed
  }
}
