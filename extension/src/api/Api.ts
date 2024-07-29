import * as vscode from "vscode";
import { Output } from "../proto/gradle_pb";
import { Logger, logger } from "../logger";
import { GradleTasksTreeDataProvider } from "../views";
import { TaskServerClient } from "../client";
import { Icons } from "../icons";
import { getRunBuildCancellationKey } from "../client/CancellationKeys";
import { GradleTaskProvider } from "../tasks";

export interface RunTaskOpts {
    projectFolder: string;
    taskName: string;
    args?: ReadonlyArray<string>;
    input?: string;
    onOutput?: (output: Output) => void;
    showOutputColors: boolean;
    cancellationKey?: string;
}

export interface RunBuildOpts {
    projectFolder: string;
    args: ReadonlyArray<string>;
    input?: string;
    onOutput?: (output: Output) => void;
    showOutputColors: boolean;
    cancellationKey?: string;
}

export interface CancelTaskOpts {
    projectFolder?: string;
    taskName?: string;
    cancellationKey?: string;
}

export interface CancelBuildOpts {
    projectFolder?: string;
    args?: ReadonlyArray<string>;
    cancellationKey?: string;
}

export class Api {
    constructor(
        private readonly client: TaskServerClient,
        private readonly tasksTreeDataProvider: GradleTasksTreeDataProvider,
        private readonly gradleTaskProvider: GradleTaskProvider,
        private readonly icons: Icons
    ) {}

    public onReady(callback: () => void): vscode.Disposable {
        return this.client.onDidConnect(callback);
    }

    public runTask(opts: RunTaskOpts): Promise<void> {
        const taskArgs = (opts.args || []).filter(Boolean);
        const runBuildArgs = [opts.taskName].concat(taskArgs);
        const runBuildOpts = {
            ...opts,
            args: runBuildArgs,
        };
        return this.runBuild(runBuildOpts);
    }

    public runBuild(opts: RunBuildOpts): Promise<void> {
        return this.client.runBuild(
            opts.projectFolder,
            opts.cancellationKey || getRunBuildCancellationKey(opts.projectFolder, opts.args),
            opts.args,
            opts.input,
            0,
            undefined,
            opts.onOutput,
            opts.showOutputColors
        );
    }

    public cancelRunTask(opts: CancelTaskOpts): Promise<void> {
        const args = opts.taskName ? [opts.taskName] : [];
        const cancelBuildOpts = {
            projectFolder: opts.projectFolder,
            args,
            cancellationKey: opts.cancellationKey,
        };
        return this.cancelRunBuild(cancelBuildOpts);
    }

    public cancelRunBuild(opts: CancelBuildOpts): Promise<void> {
        const cancellationKey = this.getRunBuildCancellationKey(opts);
        return this.client.cancelBuild(cancellationKey);
    }

    public cancelAllBuilds(): Promise<void> {
        return this.client.cancelBuilds();
    }

    private getRunBuildCancellationKey(opts: CancelBuildOpts): string {
        if (opts.cancellationKey) {
            return opts.cancellationKey;
        }
        if (!opts.args || !opts.projectFolder) {
            throw new Error("args and projectFolder are required to build the cancellation key");
        }
        return getRunBuildCancellationKey(opts.projectFolder, opts.args);
    }

    public getTasksTreeProvider(): GradleTasksTreeDataProvider {
        return this.tasksTreeDataProvider;
    }

    public getTaskProvider(): GradleTaskProvider {
        return this.gradleTaskProvider;
    }

    public getIcons(): Icons {
        return this.icons;
    }

    public getLogger(): Logger {
        return logger;
    }
}
