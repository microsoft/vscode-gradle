import * as assert from "assert";
import * as net from "net";
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
    let connect: sinon.SinonStub;
    let connections: net.Socket[];

    beforeEach(() => {
        opening = undefined;
        sinon.stub(util, "isTest").returns(false);
        waitOnTcp = sinon.stub(util, "waitOnTcp");
        connections = [];
        connect = sinon.stub(net, "connect").callsFake(() => {
            const connection = new net.Socket();
            sinon.stub(connection, "setTimeout").returns(connection);
            connections.push(connection);
            return connection;
        });
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

    function emitOutput(
        message: string,
        outputType: Output.OutputTypeMap[keyof Output.OutputTypeMap] = Output.OutputType.STDOUT
    ): void {
        const output = new Output();
        output.setOutputType(outputType);
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

    it("attaches through TCP when redirected output hides the readiness banner", async () => {
        await startTask();
        assert.ok(connect.calledOnceWithExactly(debugPort, "localhost"));
        connections[0].emit("connect");
        await settle();
        assert.ok(startDebugging.calledOnce);
        assert.strictEqual(startDebugging.firstCall.args[1].port, debugPort);
        assert.ok(connections[0].destroyed);
    });

    it("retries refused and timed-out probes beyond one minute without cancelling the build", async () => {
        await startTask();
        const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
        for (let attempt = 0; attempt < 121; attempt++) {
            const connection = connections[connections.length - 1];
            if (attempt % 2 === 0) {
                connection.emit("error", Object.assign(new Error("Not listening yet"), { code: "ECONNREFUSED" }));
            } else {
                connection.emit("timeout");
            }
            await settle();
            assert.ok(connection.destroyed);
            await clock.tickAsync(1000);
        }
        assert.ok(connect.callCount > 120);
        assert.ok(!executeCommand.called);
        assert.ok(!showErrorMessage.called);
        connections[connections.length - 1].emit("connect");
        await settle();
        assert.ok(startDebugging.calledOnce);
    });

    for (const bannerFirst of [false, true]) {
        it(`attaches once when TCP and banner readiness race (${bannerFirst ? "banner" : "TCP"} first)`, async () => {
            await startTask();
            if (bannerFirst) {
                emitReady();
                connections[0].emit("connect");
            } else {
                connections[0].emit("connect");
                await settle();
                emitReady();
            }
            await settle();
            assert.ok(startDebugging.calledOnce);
            assert.ok(connections[0].destroyed);
        });
    }

    for (const outcome of ["completion", "failure", "close", "interrupt", "readiness"]) {
        it(`stops scheduled probes after ${outcome}`, async () => {
            await startTask();
            const clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
            connections[0].emit("error", Object.assign(new Error("Not ready"), { code: "ECONNREFUSED" }));
            await settle();
            if (outcome === "completion") {
                completeBuild();
                await opening;
            } else if (outcome === "failure") {
                failBuild(new Error("Compilation failed"));
                await opening;
            } else if (outcome === "close") {
                await terminal.close();
            } else if (outcome === "interrupt") {
                await terminal.handleInput("\x03");
            } else {
                emitReady();
            }
            await clock.tickAsync(120000);
            assert.ok(connect.calledOnce);
            assert.strictEqual(startDebugging.callCount, outcome === "readiness" ? 1 : 0);
        });
    }

    it("reports unexpected socket failures instead of retrying indefinitely", async () => {
        await startTask();
        connections[0].emit("error", Object.assign(new Error("Permission denied"), { code: "EACCES" }));
        await settle();
        assert.ok(connections[0].destroyed);
        assert.ok(showErrorMessage.calledOnceWithExactly("Unable to start Java debugging: Permission denied"));
        assert.ok(executeCommand.calledOnceWithExactly(COMMAND_CANCEL_BUILD, "slow-build", task));
        assert.ok(!startDebugging.called);
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

    for (const outputType of [Output.OutputType.STDOUT, Output.OutputType.STDERR]) {
        it(`handles a split readiness message with interleaved output from the other stream (${outputType})`, async () => {
            await startTask();
            const otherType =
                outputType === Output.OutputType.STDOUT ? Output.OutputType.STDERR : Output.OutputType.STDOUT;
            const written: string[] = [];
            const subscription = terminal.onDidWrite((message) => written.push(message));
            emitOutput("Listening for transport dt_", outputType);
            emitOutput("Warning from the other stream\n", otherType);
            assert.ok(!startDebugging.called);
            emitOutput(`socket at address: ${debugPort}\n`, outputType);
            subscription.dispose();
            assert.ok(startDebugging.calledOnce);
            assert.strictEqual(
                written.join(""),
                `Listening for transport dt_Warning from the other stream\n\rsocket at address: ${debugPort}\n\r`
            );
        });
    }

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
        assert.ok(!connect.called);
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
        connections[0].emit("connect");
        await settle();
        assert.ok(!startDebugging.called);
        assert.ok(connections[0].destroyed);
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
        connections[0].emit("connect");
        await settle();
        assert.ok(!startDebugging.called);
        assert.ok(connections[0].destroyed);
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
            connections[0].emit("connect");
            await settle();
            completeBuild();
            await opening;
            assert.ok(!startDebugging.called);
            assert.ok(!showErrorMessage.called);
            assert.ok(connections[0].destroyed);
        });
    }

    it("does not start a build after its terminal was closed", async () => {
        await terminal.close();
        opening = terminal.open();
        await opening;
        assert.ok(!client.runBuild.called);
        assert.ok(!startDebugging.called);
    });

    it("closes the task when interrupted while allocating its debug port", async () => {
        const exitCodes: number[] = [];
        const subscription = terminal.onDidClose((code) => exitCodes.push(code));
        opening = terminal.open();
        await terminal.handleInput("\x03");
        await opening;
        subscription.dispose();
        assert.deepStrictEqual(exitCodes, [0]);
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

    for (const outcome of ["close", "interrupt", "completion"]) {
        for (const rejected of [false, true]) {
            it(`ignores a late attach ${rejected ? "rejection" : "false result"} after ${outcome}`, async () => {
                let finishAttach: (started: boolean) => void;
                let rejectAttach: (err: Error) => void;
                startDebugging.returns(
                    new Promise<boolean>((resolve, reject) => {
                        finishAttach = resolve;
                        rejectAttach = reject;
                    })
                );
                await startTask();
                emitReady();
                if (outcome === "close") {
                    await terminal.close();
                    await terminal.close();
                } else if (outcome === "interrupt") {
                    await terminal.handleInput("\x03");
                    await terminal.handleInput("\x03");
                } else {
                    completeBuild();
                    await opening;
                }
                if (rejected) {
                    rejectAttach!(new Error("Late attach failure"));
                } else {
                    finishAttach!(false);
                }
                await settle();
                assert.ok(!showErrorMessage.called);
                assert.ok(!logError.called);
                assert.strictEqual(executeCommand.callCount, outcome === "completion" ? 0 : 1);
                assert.ok(startDebugging.calledOnce);
            });
        }
    }

    for (const action of ["close", "interrupt"]) {
        it(`closes without submitting a build after a task ${action} while resolving tool options`, async () => {
            let resolveOptions: (options: string) => void;
            let notifyOptionsRequested: () => void;
            const optionsRequested = new Promise<void>((resolve) => {
                notifyOptionsRequested = resolve;
            });
            const exitCodes: number[] = [];
            const subscription = terminal.onDidClose((code) => exitCodes.push(code));
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
                if (action === "close") {
                    await terminal.close();
                } else {
                    await terminal.handleInput("\x03");
                }
                resolveOptions!("");
                await opening;
                assert.deepStrictEqual(exitCodes, [0]);
                assert.ok(!client.runBuild.called);
                assert.ok(!startDebugging.called);
            } finally {
                subscription.dispose();
                toolOptionsProviders.splice(toolOptionsProviders.indexOf(provider), 1);
            }
        });
    }
});
