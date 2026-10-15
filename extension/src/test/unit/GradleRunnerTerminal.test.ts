import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { toolOptionsProviders } from "../../api";
import { TaskServerClient } from "../../client";
import { COMMAND_CANCEL_BUILD } from "../../commands";
import { logger } from "../../logger";
import { Output } from "../../proto/gradle_pb";
import { RootProject } from "../../rootProject/RootProject";
import * as taskUtil from "../../tasks/taskUtil";
import { GradleRunnerTerminal } from "../../terminal";
import * as util from "../../util";
import { buildMockTaskDefinition, buildMockWorkspaceFolder, getSuiteName } from "../testUtil";

describe(getSuiteName("Gradle task debug readiness"), () => {
    const workspaceFolder = buildMockWorkspaceFolder(0, "slow-project", "slow-project");
    const rootProject = new RootProject(workspaceFolder, workspaceFolder.uri);
    let client: sinon.SinonStubbedInstance<TaskServerClient>;
    let terminal: GradleRunnerTerminal;
    let task: vscode.Task;
    let opening: Promise<void> | undefined;
    let buildStarted: Promise<void>;
    let completeBuild: () => void;
    let failBuild: (err: Error) => void;
    let outputHandler: (output: Output) => void;
    let debugPort: number;
    let startDebugging: sinon.SinonStub;
    let showErrorMessage: sinon.SinonStub;
    let executeCommand: sinon.SinonStub;
    let logError: sinon.SinonStub;
    let waitOnTcp: sinon.SinonStub;

    beforeEach(() => {
        opening = undefined;
        sinon.stub(util, "isTest").returns(false);
        waitOnTcp = sinon.stub(util, "waitOnTcp");
        startDebugging = sinon.stub(vscode.debug, "startDebugging").resolves(true);
        showErrorMessage = sinon.stub(vscode.window, "showErrorMessage").resolves();
        executeCommand = sinon.stub(vscode.commands, "executeCommand").resolves();
        logError = sinon.stub(logger, "error");
        sinon.stub(taskUtil, "isTaskRunning").returns(true);
        client = sinon.createStubInstance(TaskServerClient);
        const build = new Promise<void>((resolve, reject) => {
            completeBuild = resolve;
            failBuild = reject;
        });
        let notifyBuildStarted: () => void;
        buildStarted = new Promise<void>((resolve) => {
            notifyBuildStarted = resolve;
        });
        client.runBuild.callsFake((_project, _key, _args, _input, port, _task, onOutput) => {
            assert.ok(onOutput);
            debugPort = port ?? 0;
            outputHandler = onOutput;
            notifyBuildStarted();
            return build;
        });
        terminal = new GradleRunnerTerminal(rootProject, ["bootRun"], "slow-build", client);
        const definition = buildMockTaskDefinition(workspaceFolder, "bootRun", "", "", "slow-app");
        definition.javaDebug = true;
        task = new vscode.Task(
            definition,
            workspaceFolder,
            "bootRun",
            "gradle",
            new vscode.CustomExecution(async () => terminal)
        );
        terminal.setTask(task);
    });

    afterEach(async () => {
        completeBuild();
        await opening;
        sinon.restore();
    });

    async function startTask(): Promise<void> {
        opening = terminal.open();
        await buildStarted;
    }

    function emitOutput(message: string): void {
        const output = new Output();
        output.setOutputBytes(Buffer.from(message));
        outputHandler(output);
    }

    function emitReady(address = String(debugPort)): void {
        emitOutput(`Listening for transport dt_socket at address: ${address}\n`);
    }

    async function settle(): Promise<void> {
        await new Promise<void>((resolve) => setImmediate(resolve));
    }

    it("waits through compilation longer than one minute and attaches when JDWP is ready", async () => {
        await startTask();
        const clock = sinon.useFakeTimers();
        emitOutput("> Task :compileJava\n");
        await clock.tickAsync(120000);
        assert.ok(!startDebugging.called);
        assert.ok(!executeCommand.called);
        assert.ok(!showErrorMessage.called);
        assert.ok(!waitOnTcp.called);

        emitReady();
        assert.ok(startDebugging.calledOnce);
        assert.deepStrictEqual(startDebugging.firstCall.args, [
            workspaceFolder,
            {
                type: "java",
                name: "Debug (Attach) via Gradle Tasks",
                request: "attach",
                hostName: "localhost",
                port: debugPort,
                projectName: "slow-app",
            },
        ]);
    });

    it("handles split readiness messages and ports, and attaches only once", async () => {
        await startTask();
        const port = String(debugPort);
        emitOutput("Listening for transport dt_");
        emitOutput(`socket at address: ${port.slice(0, -1)}`);
        assert.ok(!startDebugging.called);
        emitOutput(port.slice(-1));
        assert.ok(!startDebugging.called);
        emitOutput("\r");
        emitOutput("\n");
        emitReady();
        assert.ok(startDebugging.calledOnce);
    });

    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
        it(`recognizes a readiness address containing ${host}`, async () => {
            await startTask();
            emitReady(`${host}:${debugPort}`);
            assert.ok(startDebugging.calledOnce);
        });
    }

    it("ignores other ports and port prefixes before the matching readiness message", async () => {
        await startTask();
        emitReady(String(debugPort + 1));
        emitReady(`${debugPort}0`);
        emitOutput(`Listening for transport dt_socket at address: ${debugPort}`);
        assert.ok(!startDebugging.called);
        emitOutput("0\n");
        assert.ok(!startDebugging.called);
        emitReady();
        assert.ok(startDebugging.calledOnce);
    });

    it("handles ANSI sequences split across output chunks without changing terminal output", async () => {
        await startTask();
        const written: string[] = [];
        const subscription = terminal.onDidWrite((message) => written.push(message));
        emitOutput("x".repeat(1024) + "\n");
        emitOutput("\u001b[");
        emitOutput(`32mListening for transport dt_socket at address: ${debugPort}\u001b[0m\n`);
        subscription.dispose();
        assert.ok(startDebugging.calledOnce);
        assert.strictEqual(
            written.join(""),
            "x".repeat(1024) + `\n\r\u001b[32mListening for transport dt_socket at address: ${debugPort}\u001b[0m\n\r`
        );
    });

    it("does not attach for ordinary non-debug tasks", async () => {
        task.definition.javaDebug = false;
        await startTask();
        assert.strictEqual(debugPort, 0);
        emitReady("12345");
        completeBuild();
        await opening;
        assert.ok(!startDebugging.called);
        assert.ok(!showErrorMessage.called);
    });

    it("reports task completion without readiness instead of waiting indefinitely", async () => {
        await startTask();
        completeBuild();
        await opening;
        const message = "Unable to start Java debugging: The task completed without the debugger being attached";
        assert.ok(logError.calledOnceWithExactly(message));
        assert.ok(showErrorMessage.calledOnceWithExactly(message));
        assert.ok(!executeCommand.called);
        emitReady();
        assert.ok(!startDebugging.called);
    });

    it("preserves build failures and clears pending readiness", async () => {
        await startTask();
        const written: string[] = [];
        const exitCodes: number[] = [];
        const writeSubscription = terminal.onDidWrite((message) => written.push(message));
        const closeSubscription = terminal.onDidClose((code) => exitCodes.push(code));
        failBuild(new Error("Compilation failed"));
        await opening;
        writeSubscription.dispose();
        closeSubscription.dispose();
        assert.deepStrictEqual(written, ["Compilation failed"]);
        assert.deepStrictEqual(exitCodes, [1]);
        assert.ok(!showErrorMessage.called);
        emitReady();
        assert.ok(!startDebugging.called);
    });

    for (const action of ["close", "interrupt"]) {
        it(`stops waiting after a task ${action}, including late output`, async () => {
            await startTask();
            if (action === "close") {
                await terminal.close();
            } else {
                await terminal.handleInput("\x03");
            }
            assert.ok(executeCommand.calledOnceWithExactly(COMMAND_CANCEL_BUILD, "slow-build", task));
            emitReady();
            completeBuild();
            await opening;
            assert.ok(!startDebugging.called);
            assert.ok(!showErrorMessage.called);
        });
    }

    it("does not start a build after its terminal was closed", async () => {
        await terminal.close();
        opening = terminal.open();
        await opening;
        assert.ok(!client.runBuild.called);
        assert.ok(!startDebugging.called);
    });

    for (const rejected of [false, true]) {
        it(`reports and cancels the task when debugger attachment ${
            rejected ? "rejects" : "returns false"
        }`, async () => {
            if (rejected) {
                startDebugging.rejects(new Error("Attach failed"));
            } else {
                startDebugging.resolves(false);
            }
            await startTask();
            emitReady();
            await settle();
            const message =
                "Unable to start Java debugging: " + (rejected ? "Attach failed" : "The debugger was not started");
            assert.ok(showErrorMessage.calledOnceWithExactly(message));
            assert.ok(logError.calledOnceWithExactly(message));
            assert.ok(executeCommand.calledOnceWithExactly(COMMAND_CANCEL_BUILD, "slow-build", task));
            emitReady();
            assert.ok(startDebugging.calledOnce);
        });
    }

    it("does not submit a build if cancelled while resolving tool options", async () => {
        let resolveOptions: (options: string) => void;
        let notifyOptionsRequested: () => void;
        const optionsRequested = new Promise<void>((resolve) => {
            notifyOptionsRequested = resolve;
        });
        const provider = {
            resolveToolOptions: () =>
                new Promise<string>((resolve) => {
                    resolveOptions = resolve;
                    notifyOptionsRequested();
                }),
        };
        toolOptionsProviders.push(provider);
        try {
            opening = terminal.open();
            await optionsRequested;
            await terminal.close();
            resolveOptions!("");
            await opening;
            assert.ok(!client.runBuild.called);
            assert.ok(!startDebugging.called);
        } finally {
            toolOptionsProviders.splice(toolOptionsProviders.indexOf(provider), 1);
        }
    });
});
