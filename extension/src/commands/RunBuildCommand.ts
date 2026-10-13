import * as vscode from "vscode";
import { parseArgsStringToArgv } from "string-argv";
import { getGradleCommand, getRootProjectFolder } from "../util/input";
import { GradleRunnerTerminal } from "../terminal";
import { getRunBuildCancellationKey } from "../client/CancellationKeys";
import { logger } from "../logger";
import { Command } from "./Command";
import { RootProjectsStore } from "../stores";
import { TaskServerClient } from "../client";
import { findRootProject } from "../client/utils";
import { getBuildDirectory } from "../util";
import { RunBuildArgs, RunBuildEnvironment, RunBuildOptions, RunBuildResult } from "./types";
export const COMMAND_RUN_BUILD = "gradle.runBuild";
const JAVA_UPDATE_PROJECT_COMMAND = "java.projectConfiguration.update";

export class RunBuildCommand extends Command {
    constructor(private rootProjectsStore: RootProjectsStore, private client: TaskServerClient) {
        super();
    }

    /**
     * Runs a Gradle build in a task terminal.
     *
     * Without arguments the user is asked for the root project and the command. The arguments allow other
     * extensions to run a build without any interaction. In that case the command completes when the
     * build has ended, and fails if the build did not succeed.
     *
     * @param buildFile path of the build file (or of the directory) of the project to run the build in,
     * for example a subproject. The root project is determined from it.
     * @param command the Gradle command line, tasks and options, for example `clean build --info`
     * @param environment environment variables for the build, on top of the environment of the Gradle
     * server. `JAVA_HOME` is used as the Java home to run Gradle with.
     * @param options `refreshJavaProject: true` reloads the Java project of the build after the build succeeded
     * @returns with arguments, whether the build succeeded or was cancelled. The command fails if the build
     * fails or if there is no project to run it in, which the caller of the command sees as no result.
     * Otherwise nothing.
     */
    async run(
        buildFile?: string,
        command?: string,
        environment?: RunBuildEnvironment,
        options?: RunBuildOptions
    ): Promise<RunBuildResult | undefined> {
        // the registered command appends an empty list of parameters after the arguments of the caller, so the
        // arguments that were not passed are not necessarily undefined
        const args = parseRunBuildArgs([buildFile, command, environment, options]);
        ({ buildFile, command, environment, options } = args);
        let projectDir: string | undefined;
        let rootProject;
        if (buildFile) {
            projectDir = getBuildDirectory(buildFile);
            rootProject = await findRootProject(this.rootProjectsStore, projectDir);
            if (!rootProject) {
                throw new Error(`No Gradle project found for: ${buildFile}`);
            }
        } else {
            rootProject = await getRootProjectFolder(this.rootProjectsStore);
            if (!rootProject) {
                return;
            }
        }
        const gradleCommand = command?.trim() || (await getGradleCommand());
        if (!gradleCommand) {
            return;
        }

        const gradleArgs: string[] = parseArgsStringToArgv(gradleCommand.trim());
        const buildDir = projectDir ?? rootProject.getProjectUri().fsPath;
        const cancellationKey = getRunBuildCancellationKey(buildDir, gradleArgs);
        const terminal = new GradleRunnerTerminal(rootProject, gradleArgs, cancellationKey, this.client, {
            projectDir: buildDir,
            environment,
        });
        const interactive = !buildFile;
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
            focus: interactive,
            panel: vscode.TaskPanelKind.Shared,
            reveal: vscode.TaskRevealKind.Always,
        };
        // listen before the task starts such that the end of the build cannot be missed
        const finished = interactive ? undefined : this.whenBuildEnded(terminal, gradleCommand);
        finished?.catch(() => undefined);
        await vscode.tasks.executeTask(task);
        const result = await finished;
        if (result?.status === "succeeded" && options?.refreshJavaProject) {
            await this.refreshJavaProject(buildDir);
        }
        return result;
    }

    private async refreshJavaProject(projectDir: string): Promise<void> {
        try {
            // "Update Project" of the Java extension
            if (!(await vscode.commands.getCommands(true)).includes(JAVA_UPDATE_PROJECT_COMMAND)) {
                logger.warn(`Unable to refresh the Java project ${projectDir}: the Java extension is not available`);
                return;
            }
            await vscode.commands.executeCommand(JAVA_UPDATE_PROJECT_COMMAND, [vscode.Uri.file(projectDir)]);
        } catch (e) {
            // the build itself succeeded
            logger.warn(`Unable to refresh the Java project ${projectDir}: ${e}`);
        }
    }

    private whenBuildEnded(terminal: GradleRunnerTerminal, gradleCommand: string): Promise<RunBuildResult> {
        return new Promise<RunBuildResult>((resolve, reject) => {
            const listener = terminal.onDidClose((exitCode) => {
                listener.dispose();
                if (terminal.wasCancelled()) {
                    resolve({ status: "cancelled" });
                } else if (exitCode === 0) {
                    resolve({ status: "succeeded" });
                } else {
                    reject(new Error(`Gradle build '${gradleCommand}' failed`));
                }
            });
        });
    }
}

/**
 * The arguments of the `gradle.runBuild` command, which are optional: without them the user is asked.
 *
 * Commands are registered such that an empty list of parameters is passed after the arguments of the caller
 * (see `Commands.registerCommand`). Whatever is not of the expected type is therefore ignored, instead of being
 * mistaken for an argument (an empty list is not a path).
 */
export function parseRunBuildArgs(args: ReadonlyArray<unknown>): RunBuildArgs {
    const [buildFile, command, environment, options] = args;
    return {
        buildFile: typeof buildFile === "string" && buildFile.trim() ? buildFile : undefined,
        command: typeof command === "string" && command.trim() ? command : undefined,
        environment: isEnvironment(environment) ? environment : undefined,
        options: parseOptions(options),
    };
}

function parseOptions(value: unknown): RunBuildOptions | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    const { refreshJavaProject } = value as { refreshJavaProject?: unknown };
    return { refreshJavaProject: refreshJavaProject === true };
}

function isEnvironment(value: unknown): value is RunBuildEnvironment {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.values(value).every((v) => typeof v === "string")
    );
}
