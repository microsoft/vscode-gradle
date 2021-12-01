import * as vscode from "vscode";
import { TaskId } from "./types";
import { StoreMapSet } from ".";

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
}
