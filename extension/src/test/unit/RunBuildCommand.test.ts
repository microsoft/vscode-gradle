import * as assert from "assert";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { TaskServerClient } from "../../client";
import { getRunBuildCancellationKey } from "../../client/CancellationKeys";
import { getBuildDirectory, parseRunBuildArgs, RunBuildCommand } from "../../commands/RunBuildCommand";
import { RootProject } from "../../rootProject";
import { RootProjectsStore } from "../../stores";

describe("RunBuildCommand", () => {
    it("reuses a running build only when its directory and parsed arguments match", async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders![0];
        const store = sinon.createStubInstance(RootProjectsStore);
        store.getProjectRoots.resolves([new RootProject(workspaceFolder, workspaceFolder.uri)]);
        const client = sinon.createStubInstance(TaskServerClient);
        let finishBuilds!: () => void;
        client.runBuild.returns(
            new Promise<void>((resolve) => {
                finishBuilds = resolve;
            })
        );
        const command = new RunBuildCommand(store, client);
        const executeTask = vscode.tasks.executeTask.bind(vscode.tasks);
        const executeTaskStub = sinon.stub(vscode.tasks, "executeTask");
        const pending: Promise<void>[] = [];

        function startBuild(directory: string, gradleCommand = "classes"): Promise<vscode.TaskExecution> {
            const submitted = new Promise<vscode.TaskExecution>((resolve) => {
                executeTaskStub.callsFake((task) => {
                    const execution = executeTask(task);
                    resolve(execution);
                    return execution;
                });
            });
            pending.push(command.run(path.join(directory, "build.gradle"), gradleCommand));
            return submitted;
        }

        try {
            const firstDir = path.join(workspaceFolder.uri.fsPath, "service-a");
            const secondDir = path.join(workspaceFolder.uri.fsPath, "service-b");
            const first = await startBuild(firstDir);
            const repeated = await startBuild(firstDir);
            const second = await startBuild(secondDir);
            const clean = await startBuild(firstDir, "clean");
            const build = await startBuild(firstDir, "clean build");
            const spacedBuild = await startBuild(firstDir, "clean  build");
            const combined = await startBuild(firstDir, "cleanbuild");

            assert.strictEqual(repeated, first);
            assert.notStrictEqual(second, first);
            assert.notStrictEqual(clean, first);
            assert.strictEqual(spacedBuild, build);
            assert.notStrictEqual(combined, build);
            finishBuilds();
            await Promise.all(pending);
            const calls = client.runBuild.getCalls();
            assert.strictEqual(new Set(calls.map((call) => call.args[1])).size, calls.length);
            assert.deepStrictEqual(
                calls.map((call) => [call.args[0], call.args[2]]).sort(),
                [
                    [firstDir, ["classes"]],
                    [firstDir, ["clean"]],
                    [firstDir, ["clean", "build"]],
                    [firstDir, ["cleanbuild"]],
                    [secondDir, ["classes"]],
                ].sort()
            );
        } finally {
            finishBuilds();
            try {
                await Promise.all(pending);
            } finally {
                sinon.restore();
            }
        }
    });
});

describe("getRunBuildCancellationKey", () => {
    it("preserves argument and directory boundaries", () => {
        const directory = path.resolve("project");
        assert.notStrictEqual(
            getRunBuildCancellationKey(directory, ["clean", "build"]),
            getRunBuildCancellationKey(directory, ["cleanbuild"])
        );
        assert.notStrictEqual(
            getRunBuildCancellationKey(`${directory}a`, ["bc"]),
            getRunBuildCancellationKey(`${directory}ab`, ["c"])
        );
    });

    it("uses the same identity for equivalent directory paths", () => {
        const directory = path.resolve("project");
        assert.strictEqual(
            getRunBuildCancellationKey(directory, ["classes"]),
            getRunBuildCancellationKey(`${directory}${path.sep}.`, ["classes"])
        );
    });
});

describe("parseRunBuildArgs", () => {
    it("takes the build file, the command and the environment", () => {
        const args = parseRunBuildArgs(["/project/build.gradle", "classes aotClasses", { JAVA_HOME: "/jdk" }]);
        assert.deepStrictEqual(args, {
            buildFile: "/project/build.gradle",
            command: "classes aotClasses",
            environment: { JAVA_HOME: "/jdk" },
        });
    });

    it("has nothing without arguments, as when run from the command palette", () => {
        // the registration appends an empty list of parameters
        assert.deepStrictEqual(parseRunBuildArgs([[]]), {
            buildFile: undefined,
            command: undefined,
            environment: undefined,
        });
        assert.deepStrictEqual(parseRunBuildArgs([]), {
            buildFile: undefined,
            command: undefined,
            environment: undefined,
        });
    });

    it("does not take an empty list for the environment", () => {
        const args = parseRunBuildArgs(["/project/build.gradle", "build", []]);
        assert.strictEqual(args.environment, undefined);
    });

    it("ignores blank text and an environment with other than text values", () => {
        assert.strictEqual(parseRunBuildArgs(["  ", "  "]).buildFile, undefined);
        assert.strictEqual(parseRunBuildArgs(["/p/build.gradle", "  "]).command, undefined);
        assert.strictEqual(parseRunBuildArgs(["/p/build.gradle", "build", { A: 1 }]).environment, undefined);
        assert.strictEqual(parseRunBuildArgs([{ not: "a path" }]).buildFile, undefined);
    });

    it("accepts an empty environment", () => {
        assert.deepStrictEqual(parseRunBuildArgs(["/p/build.gradle", "build", {}]).environment, {});
    });
});

describe("getBuildDirectory", () => {
    it("returns the directory of a build file and a directory as it is", () => {
        assert.strictEqual(
            getBuildDirectory(path.resolve("workspace", "sub", "build.gradle")),
            path.resolve("workspace", "sub")
        );
        assert.strictEqual(getBuildDirectory(__dirname), __dirname);
    });
});
