import { confirmModal } from "../util/input";
import { RecentTasksStore } from "../stores";
import { Command } from "./Command";

export const COMMAND_CLEAR_ALL_RECENT_TASKS = "gradle.clearAllRecentTasks";

export class ClearAllRecentTasksCommand extends Command {
    constructor(private recentTasksStore: RecentTasksStore) {
        super();
    }

    async run(): Promise<void> {
        if (
            this.recentTasksStore.getData().size &&
            (await confirmModal("Are you sure you want to clear the recent tasks?"))
        ) {
            this.recentTasksStore.clear();
        }
    }
}
