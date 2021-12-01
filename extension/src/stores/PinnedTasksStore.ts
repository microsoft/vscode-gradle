import * as vscode from "vscode";
import { TaskArgs, TaskId } from "./types";
import { TaskStore } from ".";

interface WorkspaceStateTasks {
    [key: string]: TaskArgs[];
}

const toWorkspaceStateTasks = (map: Map<TaskId, Set<TaskArgs>>): WorkspaceStateTasks => {
    return Array.from(map.keys()).reduce((workspaceStateTasks: WorkspaceStateTasks, key: string) => {
        workspaceStateTasks[key] = Array.from(map.get(key)!.values());
        return workspaceStateTasks;
    }, {});
};

export class PinnedTasksStore extends TaskStore {
    constructor(private readonly context: vscode.ExtensionContext) {
        super();
        const pinnedTasks = this.context.workspaceState.get("pinnedTasks", {}) as WorkspaceStateTasks;
        if (!pinnedTasks || Array.isArray(pinnedTasks) || typeof pinnedTasks !== "object") {
            return;
        }
        Object.keys(pinnedTasks).forEach((taskId: TaskId) => {
            this.setItem(taskId, new Set(pinnedTasks[taskId]), false);
        });
    }

    public async fireOnDidChange(): Promise<void> {
        const workspaceStateTasks: WorkspaceStateTasks = toWorkspaceStateTasks(this.getData());
        await this.context.workspaceState.update("pinnedTasks", workspaceStateTasks);
        super.fireOnDidChange(null);
    }
}
