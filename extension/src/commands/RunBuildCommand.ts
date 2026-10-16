import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { parseArgsStringToArgv } from "string-argv";
import { getGradleCommand, getRootProjectFolder } from "../util/input";
import { GradleRunnerTerminal } from "../terminal";
import { getRunBuildCancellationKey } from "../client/CancellationKeys";
import { Command } from "./Command";
import { RootProjectsStore } from "../stores";
import { TaskServerClient } from "../client";
import { findRootProject } from "../client/utils";
import { RunBuildArgs, RunBuildEnvironment } from "./types";
export const COMMAND_RUN_BUILD = "gradle.runBuild";

export class RunBuildCommand extends Command {
    constructor(private rootProjectsStore: RootProjectsStore, private client: TaskServerClient) {
        super();
    }

    /**
     * Runs a Gradle build in a task terminal.
     *
     * Without a command the user is asked for it, and for the root project. The arguments allow other
     * extensions to run a build without any interaction. The command completes when the build has finished.
     * A build that is running already (same build directory and parsed arguments) is not run again, the command
     * completes when that build has finished.
     *
     * @param buildFile path of the build file (or of the directory) of the project to run the build in,
     * for example a subproject. The root project is determined from it.
     * @param command the Gradle command line, tasks and options, for example `clean build --info`
     * @param environment environment variables for the build, on top of the environment of the Gradle
     * server. `JAVA_HOME` is used as the Java home to run Gradle with.
     */
    async run(buildFile?: string, command?: string, environment?: RunBuildEnvironment): Promise<void> {
        // the registered command appends an empty list of parameters after the arguments of the caller, so the
        // arguments that were not passed are not necessarily undefined
        ({ buildFile, command, environment } = parseRunBuildArgs([buildFile, command, environment]));
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

        const args: string[] = parseArgsStringToArgv(gradleCommand.trim());
        const buildDir = projectDir ?? rootProject.getProjectUri().fsPath;
        const cancellationKey = getRunBuildCancellationKey(buildDir, args);
        const terminal = new GradleRunnerTerminal(rootProject, args, cancellationKey, this.client, {
            projectDir: buildDir,
            environment,
        });
        const task = new vscode.Task(
            {
                type: "gradle",
                id: cancellationKey,
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
            // the user that enters the command gets the focus, not the extension that runs a build
            focus: !command,
            panel: vscode.TaskPanelKind.Shared,
            reveal: vscode.TaskRevealKind.Always,
        };
        await executeTaskAndWait(task);
    }
}

/**
 * Starts the task and resolves when its execution has ended, however it ended. VS Code does not run a task again
 * that is active already: it returns the execution that is running, so the call ends with that execution. It
 * listens before the task starts such that the end of a short build cannot be missed.
 */
function executeTaskAndWait(task: vscode.Task): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const ended = new Set<vscode.TaskExecution>();
        let started: vscode.TaskExecution | undefined;
        const resolveIfEnded = (): void => {
            if (started && ended.has(started)) {
                listener.dispose();
                resolve();
            }
        };
        const listener = vscode.tasks.onDidEndTask((e) => {
            ended.add(e.execution);
            resolveIfEnded();
        });
        vscode.tasks.executeTask(task).then(
            (execution) => {
                started = execution;
                resolveIfEnded();
            },
            (e) => {
                listener.dispose();
                reject(e);
            }
        );
    });
}

/**
 * The arguments of the `gradle.runBuild` command, which are optional: without them the user is asked.
 *
 * Commands are registered such that an empty list of parameters is passed after the arguments of the caller
 * (see `Commands.registerCommand`). Whatever is not of the expected type is therefore ignored, instead of being
 * mistaken for an argument (an empty list is not a path).
 */
export function parseRunBuildArgs(args: ReadonlyArray<unknown>): RunBuildArgs {
    const [buildFile, command, environment] = args;
    return {
        buildFile: typeof buildFile === "string" && buildFile.trim() ? buildFile : undefined,
        command: typeof command === "string" && command.trim() ? command : undefined,
        environment: isEnvironment(environment) ? environment : undefined,
    };
}

function isEnvironment(value: unknown): value is RunBuildEnvironment {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.values(value).every((v) => typeof v === "string")
    );
}

/**
 * The directory of the Gradle build for a path, which can be the path of a build file (the directory
 * of the file is returned) or the path of a directory (returned as it is).
 */
export function getBuildDirectory(fsPath: string): string {
    try {
        if (fs.statSync(fsPath).isDirectory()) {
            return fsPath;
        }
    } catch {
        // the path does not exist, take it as the path of a file
    }
    return path.dirname(fsPath);
}
