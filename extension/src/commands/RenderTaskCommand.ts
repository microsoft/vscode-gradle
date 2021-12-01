import * as vscode from "vscode";
import { GradleTasksTreeDataProvider, PinnedTasksTreeDataProvider, RecentTasksTreeDataProvider } from "../views";
import { updateGradleTreeItemStateForTask } from "../views/viewUtil";
import { Command } from "./Command";
export const COMMAND_RENDER_TASK = "gradle.renderTask";

export class RenderTaskCommand extends Command {
    constructor(
        private gradleTasksTreeDataProvider: GradleTasksTreeDataProvider,
        private pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider,
        private recentTasksTreeDataProvider: RecentTasksTreeDataProvider
    ) {
        super();
    }
    async run(task: vscode.Task): Promise<void> {
        updateGradleTreeItemStateForTask(
            task,
            this.gradleTasksTreeDataProvider,
            this.pinnedTasksTreeDataProvider,
            this.recentTasksTreeDataProvider
        );
    }
}
