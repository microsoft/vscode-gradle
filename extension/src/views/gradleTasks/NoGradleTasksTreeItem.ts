import { NoTasksTreeItem } from "..";
import { COMMAND_SHOW_LOGS } from "../../commands";

export class NoGradleTasksTreeItem extends NoTasksTreeItem {
    constructor() {
        super("No tasks found");
        this.command = {
            title: "Show Logs",
            command: COMMAND_SHOW_LOGS,
        };
    }
}
