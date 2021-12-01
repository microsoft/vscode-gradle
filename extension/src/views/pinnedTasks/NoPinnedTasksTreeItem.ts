import { NoTasksTreeItem } from "..";
import { COMMAND_OPEN_PIN_HELP } from "../../commands";

export class NoPinnedTasksTreeItem extends NoTasksTreeItem {
    constructor() {
        super("No pinned tasks");
        this.command = {
            title: "Show Help",
            command: COMMAND_OPEN_PIN_HELP,
        };
    }
}
