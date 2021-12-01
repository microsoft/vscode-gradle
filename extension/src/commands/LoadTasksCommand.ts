import * as vscode from "vscode";
import { GradleTaskProvider } from "../tasks";
import { Command } from "./Command";
export const COMMAND_LOAD_TASKS = "gradle.loadTasks";

export class LoadTasksCommand extends Command {
    constructor(private gradleTaskProvider: GradleTaskProvider) {
        super();
    }
    async run(): Promise<vscode.Task[]> {
        return this.gradleTaskProvider.loadTasks();
    }
}
