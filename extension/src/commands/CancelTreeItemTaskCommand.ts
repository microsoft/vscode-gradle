import * as vscode from "vscode";
import { GradleTaskTreeItem } from "../views";
import { COMMAND_CANCEL_BUILD } from ".";
import { getRunTaskCommandCancellationKey } from "../client/CancellationKeys";
import { GradleTaskDefinition } from "../tasks";
import { getRunningGradleTask } from "../tasks/taskUtil";
import { Command } from "./Command";
export const COMMAND_CANCEL_TREE_ITEM_TASK = "gradle.cancelTreeItemTask";

export class CancelTreeItemTaskCommand extends Command {
    async run(treeItem: GradleTaskTreeItem): Promise<void> {
        if (treeItem && treeItem.task) {
            // We get the running task as we could be cancelling a task that is running with args
            const runningTask = getRunningGradleTask(treeItem.task);
            if (!runningTask) {
                return;
            }
            const definition = runningTask.definition as GradleTaskDefinition;
            const cancellationKey = getRunTaskCommandCancellationKey(definition.projectFolder, runningTask.name);
            return vscode.commands.executeCommand(COMMAND_CANCEL_BUILD, cancellationKey, runningTask);
        }
    }
}
