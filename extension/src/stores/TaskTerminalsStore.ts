import * as vscode from 'vscode';
import { TaskId } from './types';
import { StoreMapSet } from '.';
import { GradleTaskDefinition } from '../tasks';
import { ReuseTerminalsValue } from '../util/config';

export class TaskTerminalsStore extends StoreMapSet<TaskId, vscode.Terminal> {
  removeTerminal(terminal: vscode.Terminal): void {
    Array.from(this.getData().keys()).forEach((key) => {
      const itemSet = this.getItem(key);
      if (itemSet) {
        Array.from(itemSet).forEach((taskTerminal) => {
          if (taskTerminal === terminal) {
            itemSet.delete(taskTerminal);
          }
        });
      }
    });
    this.fireOnDidChange(null);
  }

  disposeTaskTerminals(
    definition: GradleTaskDefinition,
    reuseTerminals: ReuseTerminalsValue
  ): void {
    if (reuseTerminals === 'task') {
      const previousTerminals = this.get(definition.script);
      if (previousTerminals) {
        for (const previousTerminal of previousTerminals.values()) {
          previousTerminal.dispose();
        }
        previousTerminals.clear();
      }
    } else if (reuseTerminals === 'all') {
      const store = this.getData();
      for (const taskTerminals of store.values()) {
        for (const previousTerminal of taskTerminals.values()) {
          previousTerminal.dispose();
        }
        taskTerminals.clear();
      }
    }
  }
}
