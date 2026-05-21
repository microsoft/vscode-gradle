import { GradleTaskTreeItem } from "../views";
import { runTask } from "../tasks/taskUtil";
import { Command } from "./Command";
import { RootProjectsStore } from "../stores";
import { TaskServerClient } from "../client";
import { DoubleClickChecker } from "../util/DoubleClickChecker";

export const COMMAND_RUN_TASK = "gradle.runTask";
export const COMMAND_RUN_TASK_DOUBLE_CLICK = "gradle.runTaskDoubleClick";

async function run(treeItem: GradleTaskTreeItem, rootProjectsStore: RootProjectsStore, client: TaskServerClient) {
    if (treeItem && treeItem.task) {
        await runTask(rootProjectsStore, treeItem.task, client);
    }
}

export class RunTaskCommand extends Command {
    constructor(private rootProjectsStore: RootProjectsStore, private client: TaskServerClient) {
        super();
    }

    async run(treeItem: GradleTaskTreeItem): Promise<void> {
        run(treeItem, this.rootProjectsStore, this.client);
    }
}

export class RunTaskDoubleClickCommand extends Command {
    private doubleClickChecker: DoubleClickChecker;

    constructor(private rootProjectsStore: RootProjectsStore, private client: TaskServerClient) {
        super();
        this.doubleClickChecker = new DoubleClickChecker();
    }

    async run(treeItem: GradleTaskTreeItem): Promise<void> {
        if (this.doubleClickChecker.checkDoubleClick(treeItem)) {
            return run(treeItem, this.rootProjectsStore, this.client);
        }
    }
}
