import * as vscode from "vscode";
import { parseArgsStringToArgv } from "string-argv";
import { getGradleCommand, getRootProjectFolder } from "../util/input";
import { GradleRunnerTerminal } from "../terminal";
import { getRunBuildCancellationKey } from "../client/CancellationKeys";
import { Command } from "./Command";
import { RootProjectsStore } from "../stores";
import { TaskServerClient } from "../client";
export const COMMAND_RUN_BUILD = "gradle.runBuild";

export class RunBuildCommand extends Command {
    constructor(private rootProjectsStore: RootProjectsStore, private client: TaskServerClient) {
        super();
    }
    async run(): Promise<void> {
        const rootProject = await getRootProjectFolder(this.rootProjectsStore);
        if (!rootProject) {
            return;
        }
        const gradleCommand = await getGradleCommand();
        if (!gradleCommand) {
            return;
        }

        const args: string[] = parseArgsStringToArgv(gradleCommand.trim());
        const cancellationKey = getRunBuildCancellationKey(rootProject.getProjectUri().fsPath, args);
        const terminal = new GradleRunnerTerminal(rootProject, args, cancellationKey, this.client);
        const task = new vscode.Task(
            {
                type: "gradle",
            },
            rootProject.getWorkspaceFolder(),
            gradleCommand,
            "gradle",
            new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => terminal),
            ["$gradle"]
        );
        task.presentationOptions = {
            showReuseMessage: false,
            clear: true,
            echo: true,
            focus: true,
            panel: vscode.TaskPanelKind.Shared,
            reveal: vscode.TaskRevealKind.Always,
        };
        await vscode.tasks.executeTask(task);
    }
}
