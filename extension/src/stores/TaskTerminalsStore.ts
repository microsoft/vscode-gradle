import * as vscode from 'vscode';
import { TaskArgs, TaskId } from './types';
import { StoreSet } from '.';

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
  }
}
