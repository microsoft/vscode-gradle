import * as assert from "assert";
import * as net from "net";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { PassThrough } from "stream";
import { createMessageConnection, RequestType, StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
import { TaskServerClient } from "../../client";
import { Api } from "../../api";
import { getRunTaskCommandCancellationKey } from "../../client/CancellationKeys";
import { COMMAND_CANCEL_BUILD } from "../../commands";
import { CancelBuildCommand } from "../../commands/CancelBuildCommand";
import { CancelTreeItemTaskCommand } from "../../commands/CancelTreeItemTaskCommand";
import { DebugTaskCommand } from "../../commands/DebugTaskCommand";
import { RestartTaskCommand } from "../../commands/RestartTaskCommand";
import { RunBuildCommand } from "../../commands/RunBuildCommand";
import { Icons } from "../../icons";
import { logger } from "../../logger";
import {
    CancelBuildReply,
    CancelBuildRequest,
    CancelBuildsReply,
    Cancelled,
    RunBuildReply,
    RunBuildRequest,
    RunBuildResult,
} from "../../proto/gradle_pb";
import { GradleServer } from "../../server";
import { RootProject } from "../../rootProject/RootProject";
import { RootProjectsStore } from "../../stores";
import { GradleTaskProvider } from "../../tasks";
import * as taskUtil from "../../tasks/taskUtil";
import { GradleRunnerTerminal } from "../../terminal";
import * as util from "../../util";
import * as compat from "../../util/compat";
import * as input from "../../util/input";
import { decodeProto, encodeProto } from "../../transport/jsonrpc";
import { GradleRequestParams, GradleResponse } from "../../transport/jsonrpc/types";
import { GradleTasksTreeDataProvider, GradleTaskTreeItem } from "../../views";
import { buildMockContext, buildMockTaskDefinition, buildMockWorkspaceFolder, getSuiteName } from "../testUtil";

const RUN_BUILD = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/runBuild");
const CANCEL_BUILD = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/cancelBuild");
const CANCEL_BUILDS = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/cancelBuilds");

describe(getSuiteName("TaskServerClient cancellation delivery"), () => {
    const workspaceFolder = buildMockWorkspaceFolder(0, "cancellation-project", "cancellation-project");
    let client: TaskServerClient;
    let clientToServer: PassThrough;
    let serverToClient: PassThrough;
    let connection: ReturnType<typeof createMessageConnection>;
    let serverConnection: ReturnType<typeof createMessageConnection>;
    let statusBar: vscode.StatusBarItem;
    let events: vscode.EventEmitter<null>[];
    let progressTokens: vscode.CancellationTokenSource[];
    let runs: Map<string, { resolve: (response: GradleResponse) => void; reject: (error: Error) => void }>;
    let registered: Set<string>;
    let cancelled: string[];
    let cancelRequests: string[];
    let onBuild: (request: RunBuildRequest) => void;
    let onCancel: () => void;
    let cancelReply: (key: string) => GradleResponse | Promise<GradleResponse>;
    let clock: sinon.SinonFakeTimers;
    let logError: sinon.SinonStub;
    let executeCommand: sinon.SinonStub<
        Parameters<typeof vscode.commands.executeCommand>,
        ReturnType<typeof vscode.commands.executeCommand>
    >;
    let restartQueuedTask: sinon.SinonStub;
    let removeCancellingTask: sinon.SinonStub;

    beforeEach(() => {
        clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
        clientToServer = new PassThrough();
        serverToClient = new PassThrough();
        connection = createMessageConnection(
            new StreamMessageReader(serverToClient),
            new StreamMessageWriter(clientToServer)
        );
        serverConnection = createMessageConnection(
            new StreamMessageReader(clientToServer),
            new StreamMessageWriter(serverToClient)
        );
        runs = new Map();
        registered = new Set();
        cancelled = [];
        cancelRequests = [];
        onCancel = () => undefined;
        cancelReply = acknowledgeCancellation;
        serverConnection.onRequest(RUN_BUILD, (params) => {
            assert.ok(params.request);
            const request = RunBuildRequest.deserializeBinary(decodeProto(params.request));
            return new Promise<GradleResponse>((resolve, reject) => {
                runs.set(request.getCancellationKey(), { resolve, reject });
                onBuild(request);
            });
        });
        serverConnection.onRequest(CANCEL_BUILD, (params) => {
            assert.ok(params.request);
            const request = CancelBuildRequest.deserializeBinary(decodeProto(params.request));
            cancelRequests.push(request.getCancellationKey());
            const reply = cancelReply(request.getCancellationKey());
            onCancel();
            return reply;
        });
        serverConnection.onRequest(CANCEL_BUILDS, () => {
            const reply = new CancelBuildsReply();
            return { reply: encodeProto(reply.serializeBinary()) };
        });
        serverConnection.listen();
        const server = sinon.createStubInstance(GradleServer);
        events = [new vscode.EventEmitter<null>(), new vscode.EventEmitter<null>()];
        Object.assign(server, { onDidStart: events[0].event, onDidStop: events[1].event });
        server.awaitTaskConnection.resolves(connection);
        statusBar = vscode.window.createStatusBarItem();
        progressTokens = [];
        sinon.stub(vscode.window, "withProgress").callsFake(async (_options, run) => {
            const source = new vscode.CancellationTokenSource();
            progressTokens.push(source);
            return run({ report: () => undefined }, source.token);
        });
        executeCommand = sinon.stub(vscode.commands, "executeCommand").callsFake(async (command, ...args) => {
            if (command === COMMAND_CANCEL_BUILD) {
                await client.cancelBuild(args[0], args[1]);
            }
            return undefined;
        });
        restartQueuedTask = sinon.stub(taskUtil, "restartQueuedTask").resolves();
        removeCancellingTask = sinon.stub(taskUtil, "removeCancellingTask");
        sinon.stub(logger, "info");
        logError = sinon.stub(logger, "error");
        client = new TaskServerClient(server, statusBar);
    });

    afterEach(async () => {
        for (const key of runs.keys()) {
            finish(key);
        }
        await settle();
        client.dispose();
        serverConnection.dispose();
        connection.dispose();
        clientToServer.destroy();
        serverToClient.destroy();
        progressTokens.forEach((source) => source.dispose());
        events.forEach((event) => event.dispose());
        statusBar.dispose();
        sinon.restore();
    });

    function acknowledgeCancellation(key: string): GradleResponse {
        const reply = new CancelBuildReply();
        reply.setBuildRunning(registered.has(key));
        reply.setMessage(registered.has(key) ? "Cancel build requested" : "Build is not running");
        if (registered.has(key)) {
            cancelled.push(key);
        }
        return { reply: encodeProto(reply.serializeBinary()) };
    }

    function finish(key: string): void {
        registered.delete(key);
        const reply = new RunBuildReply();
        reply.setRunBuildResult(new RunBuildResult());
        runs.get(key)?.resolve({ reply: encodeProto(reply.serializeBinary()) });
        runs.delete(key);
    }

    async function start(task?: vscode.Task): Promise<{ key: string; completed: Promise<void> }> {
        await client.handleServerStart();
        const started = new Promise<RunBuildRequest>((resolve) => {
            onBuild = resolve;
        });
        const completed = client.runBuild(workspaceFolder.uri.fsPath, "build-key", ["run"], "", 0, task);
        const request = await started;
        return { key: request.getCancellationKey(), completed };
    }

    async function settle(): Promise<void> {
        for (let turn = 0; turn < 10; turn++) {
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
    }

    function nextCancellation(): Promise<void> {
        return new Promise<void>((resolve) => {
            onCancel = resolve;
        });
    }

    function createTask(id: string): vscode.Task {
        const definition = buildMockTaskDefinition(workspaceFolder, "run", "", "", id);
        definition.id = id;
        return new vscode.Task(definition, workspaceFolder, "run", "gradle");
    }

    function createApi(): Api {
        return new Api(
            client,
            sinon.createStubInstance(GradleTasksTreeDataProvider),
            sinon.createStubInstance(GradleTaskProvider),
            new Icons(buildMockContext())
        );
    }

    function createRoots(): sinon.SinonStubbedInstance<RootProjectsStore> {
        const roots = sinon.createStubInstance(RootProjectsStore);
        roots.get.withArgs(workspaceFolder.uri.fsPath).returns(new RootProject(workspaceFolder, workspaceFolder.uri));
        return roots;
    }

    function createTreeItem(task: vscode.Task): GradleTaskTreeItem {
        return new GradleTaskTreeItem(
            new vscode.TreeItem("root"),
            task,
            "selected",
            "",
            "",
            new Icons(buildMockContext()),
            false
        );
    }

    async function createTerminal(task: vscode.Task): Promise<GradleRunnerTerminal> {
        const execution = task.execution;
        assert.ok(execution instanceof vscode.CustomExecution);
        assert.ok("callback" in execution && typeof execution.callback === "function");
        const terminal: unknown = await execution.callback(task.definition);
        assert.ok(terminal instanceof GradleRunnerTerminal);
        return terminal;
    }

    it("retains early cancellation until the server registers the build token", async () => {
        const build = await start();
        const firstAttempt = nextCancellation();
        const cancelling = client.cancelBuild("build-key");
        await firstAttempt;
        await settle();
        assert.deepStrictEqual(cancelled, []);

        await clock.tickAsync(1500);
        await settle();
        assert.ok(cancelRequests.length > 1, "An unregistered token must not discard cancellation intent");
        registered.add(build.key);
        await clock.tickAsync(500);
        await settle();
        assert.deepStrictEqual(cancelled, [build.key]);
        await cancelling;
        finish(build.key);
        await build.completed;
    });

    it("cancels before connection without submitting a build after connection", async () => {
        const completed = client.runBuild(workspaceFolder.uri.fsPath, "build-key", ["run"]);
        const cancelling = client.cancelBuild("build-key");
        await completed;
        await cancelling;
        await client.handleServerStart();
        await settle();
        assert.strictEqual(runs.size, 0);
        assert.deepStrictEqual(cancelRequests, []);
    });

    it("starts a queued replacement after cancellation before connection", async () => {
        restartQueuedTask.restore();
        removeCancellingTask.restore();
        const task = taskUtil.cloneTask(createRoots(), createTask("queued-before-connect"), "--variant", client);
        sinon.stub(vscode.tasks, "taskExecutions").value([{ task, terminate: () => undefined }]);
        const executeTask = sinon.stub(vscode.tasks, "executeTask").callsFake(async (task) => ({
            task,
            terminate: () => undefined,
        }));
        const key = getRunTaskCommandCancellationKey(workspaceFolder.uri.fsPath, task.definition.script);
        const completed = client.runBuild(workspaceFolder.uri.fsPath, key, ["run"], "", 0, task);
        const outcome = Promise.all([new RestartTaskCommand(client).run(createTreeItem(task)), completed]);
        const finished = await Promise.race([outcome.then(() => true), settle().then(() => false)]);
        assert.ok(finished, "A queued replacement must start without waiting for connection");
        assert.ok(executeTask.calledOnceWithExactly(task));
        assert.ok(!taskUtil.hasRestartingTask(task));
        assert.ok(!taskUtil.isTaskCancelling(task));
        assert.strictEqual(runs.size, 0);
    });

    it("does not start queued replacements when the client is disposed before connection", async () => {
        const completed = client.runBuild(
            workspaceFolder.uri.fsPath,
            "build-key",
            ["run"],
            "",
            0,
            createTask("disposed-before-connect")
        );
        const rejected = assert.rejects(completed, /disposed/);
        client.dispose();
        await rejected;
        assert.ok(!restartQueuedTask.called);
    });

    it("keeps retrying cancellation after an idempotent terminal closure", async () => {
        await client.handleServerStart();
        sinon.stub(util, "isTest").returns(false);
        sinon.stub(taskUtil, "isTaskRunning").returns(true);
        const task = createTask("closed-terminal");
        const terminal = new GradleRunnerTerminal(
            new RootProject(workspaceFolder, workspaceFolder.uri),
            ["run"],
            "build-key",
            client
        );
        terminal.setTask(task);
        const closed = sinon.spy();
        terminal.onDidClose(closed);
        const started = new Promise<RunBuildRequest>((resolve) => {
            onBuild = resolve;
        });
        const opening = terminal.open();
        const request = await started;
        const firstAttempt = nextCancellation();
        const closing = terminal.close();
        await firstAttempt;
        await terminal.close();
        await settle();
        await clock.tickAsync(1000);
        await settle();
        assert.ok(cancelRequests.length > 1);
        registered.add(request.getCancellationKey());
        await clock.tickAsync(500);
        await settle();
        await closing;
        assert.deepStrictEqual(cancelled, [request.getCancellationKey()]);
        finish(request.getCancellationKey());
        await opening;
        assert.ok(closed.calledOnceWithExactly(0));
    });

    it("sends normal cancellation once even when cancellation is requested again", async () => {
        const build = await start();
        registered.add(build.key);
        await client.cancelBuild("build-key");
        await client.cancelBuild("build-key");
        await clock.tickAsync(10000);
        assert.deepStrictEqual(cancelRequests, [build.key]);
        assert.deepStrictEqual(cancelled, [build.key]);
        finish(build.key);
        await build.completed;
    });

    it("retains cancellation requested by the progress notification", async () => {
        const build = await start();
        const firstAttempt = nextCancellation();
        progressTokens[progressTokens.length - 1].cancel();
        await firstAttempt;
        await settle();
        registered.add(build.key);
        await clock.tickAsync(500);
        await settle();
        assert.deepStrictEqual(cancelled, [build.key]);
        finish(build.key);
        await build.completed;
    });

    for (const fail of [false, true]) {
        it(`stops pending cancellation retries when the build ${fail ? "fails" : "completes"}`, async () => {
            const build = await start();
            const firstAttempt = nextCancellation();
            const cancelling = client.cancelBuild("build-key");
            await firstAttempt;
            await settle();
            if (fail) {
                const rejected = assert.rejects(build.completed, /Build failed/);
                runs.get(build.key)!.reject(new Error("Build failed"));
                runs.delete(build.key);
                await rejected;
            } else {
                finish(build.key);
                await build.completed;
            }
            await cancelling;
            const attempts = cancelRequests.length;
            await clock.tickAsync(10000);
            assert.strictEqual(cancelRequests.length, attempts);
            assert.strictEqual(clock.countTimers(), 0);
        });
    }

    it("does not cancel a restarted build when an old cancellation arrives after completion", async () => {
        const first = await start();
        let deliverCancellation: () => void;
        cancelReply = (key) =>
            new Promise<GradleResponse>((resolve) => {
                deliverCancellation = () => resolve(acknowledgeCancellation(key));
            });
        const firstAttempt = nextCancellation();
        const cancelling = client.cancelBuild("build-key");
        await firstAttempt;
        finish(first.key);
        await first.completed;

        const second = await start();
        registered.add(second.key);
        assert.notStrictEqual(first.key, second.key);
        deliverCancellation!();
        await cancelling;
        await clock.tickAsync(10000);
        assert.deepStrictEqual(cancelRequests, [first.key]);
        assert.deepStrictEqual(cancelled, []);
        finish(second.key);
        await second.completed;
    });

    it("discards retained intent before restarting a task with the same logical key", async () => {
        const task = createTask("same-task");
        const first = await start(task);
        const firstAttempt = nextCancellation();
        const cancelling = client.cancelBuild("build-key", task);
        await firstAttempt;
        await settle();
        finish(first.key);
        await first.completed;
        await cancelling;

        const second = await start(task);
        registered.add(second.key);
        await clock.tickAsync(10000);
        assert.deepStrictEqual(cancelRequests, [first.key]);
        assert.deepStrictEqual(cancelled, []);
        await client.cancelBuild("build-key", task);
        assert.deepStrictEqual(cancelled, [second.key]);
        finish(second.key);
        await second.completed;
    });

    it("cancels only the intended parallel task sharing a logical key", async () => {
        const firstTask = createTask("first-task");
        const first = await start(firstTask);
        const second = await start(createTask("second-task"));
        registered.add(first.key);
        registered.add(second.key);
        await client.cancelBuild("build-key", firstTask);
        assert.notStrictEqual(first.key, second.key);
        assert.deepStrictEqual(cancelled, [first.key]);
        finish(first.key);
        finish(second.key);
        await Promise.all([first.completed, second.completed]);
    });

    it("cancels only the intended argument variant sharing a task ID and logical key", async () => {
        const firstTask = createTask("same-task");
        firstTask.definition.args = "--first";
        const secondTask = createTask("same-task");
        secondTask.definition.args = "--second";
        const first = await start(firstTask);
        const second = await start(secondTask);
        registered.add(first.key);
        registered.add(second.key);
        await client.cancelBuild("build-key", firstTask);
        assert.deepStrictEqual(cancelled, [first.key]);
        finish(first.key);
        finish(second.key);
        await Promise.all([first.completed, second.completed]);
    });

    for (const entry of ["terminal", "task manager closure", "tree", "base tree", "restart", "parallel restarts"]) {
        it(`cancels the selected runTask argument variant through its ${entry} entry point`, async () => {
            await client.handleServerStart();
            removeCancellingTask.restore();
            const executions: vscode.TaskExecution[] = [];
            const openings: Promise<void>[] = [];
            const terminals: GradleRunnerTerminal[] = [];
            sinon.stub(vscode.tasks, "taskExecutions").value(executions);
            sinon.stub(vscode.tasks, "executeTask").callsFake(async (task) => {
                const terminal = await createTerminal(task);
                terminals.push(terminal);
                openings.push(terminal.open());
                const running = { task, terminate: () => undefined };
                executions.push(running);
                return running;
            });
            executeCommand.callsFake(async (command, ...args) => {
                if (command === COMMAND_CANCEL_BUILD) {
                    await new CancelBuildCommand(client).run(args[0], args[1]);
                }
                return undefined;
            });
            const roots = createRoots();
            const baseTask = createTask("parallel-argument-variants");
            const keys: string[] = [];
            for (const args of ["--first", "--second"]) {
                const started = new Promise<RunBuildRequest>((resolve) => {
                    onBuild = resolve;
                });
                await taskUtil.runTask(roots, baseTask, client, args);
                const request = await started;
                assert.strictEqual(request.getJavaDebugPort(), 0);
                keys.push(request.getCancellationKey());
                registered.add(request.getCancellationKey());
            }
            assert.strictEqual(executions[0].task.definition.id, executions[1].task.definition.id);
            assert.notStrictEqual(executions[0].task.definition.args, executions[1].task.definition.args);
            if (entry === "terminal") {
                await terminals[1].handleInput("\x03");
            } else if (entry === "task manager closure") {
                executions.length = 0;
                await terminals[1].close();
            } else if (entry === "parallel restarts") {
                restartQueuedTask.restore();
                for (const execution of executions.slice()) {
                    await new RestartTaskCommand(client).run(createTreeItem(execution.task));
                }
                assert.deepStrictEqual(cancelled, keys);
                for (const args of ["--first", "--second"]) {
                    assert.ok(taskUtil.isTaskCancelling(baseTask, args));
                    assert.ok(taskUtil.isTaskRestarting(baseTask, args));
                }
                const replacements: RunBuildRequest[] = [];
                onBuild = (request) => replacements.push(request);
                for (let index = 0; index < keys.length; index++) {
                    finish(keys[index]);
                    await openings[index];
                    await settle();
                    assert.strictEqual(executions.length, 3 + index, "Each argument variant must retain its restart");
                    assert.deepStrictEqual(replacements[index].getArgsList(), [
                        "run",
                        index === 0 ? "--first" : "--second",
                    ]);
                    assert.strictEqual(taskUtil.isTaskCancelling(baseTask, "--second"), index === 0);
                    assert.strictEqual(taskUtil.isTaskRestarting(baseTask, "--second"), index === 0);
                    finish(replacements[index].getCancellationKey());
                }
            } else if (entry === "restart") {
                restartQueuedTask.restore();
                await new RestartTaskCommand(client).run(createTreeItem(executions[1].task));
                finish(keys[0]);
                await openings[0];
                assert.strictEqual(
                    executions.length,
                    2,
                    "Completing another argument variant must not restart this one"
                );
            } else {
                const selected = createTreeItem(entry === "base tree" ? baseTask : executions[1].task);
                await new CancelTreeItemTaskCommand().run(selected);
            }
            assert.deepStrictEqual(
                cancelled,
                entry === "parallel restarts" ? keys : [keys[entry === "base tree" ? 0 : 1]]
            );
            if (entry === "restart") {
                const restarted = new Promise<RunBuildRequest>((resolve) => {
                    onBuild = resolve;
                });
                finish(keys[1]);
                const replacement = await restarted;
                assert.notStrictEqual(replacement.getCancellationKey(), keys[1]);
                assert.deepStrictEqual(replacement.getArgsList(), ["run", "--second"]);
                finish(replacement.getCancellationKey());
            } else {
                keys.forEach(finish);
            }
            await Promise.all(openings);
        });
    }

    it("isolates command-terminal cancellation while preserving explicit API logical-key fan-out", async () => {
        await client.handleServerStart();
        const root = new RootProject(workspaceFolder, workspaceFolder.uri);
        sinon.stub(input, "getRootProjectFolder").resolves(root);
        sinon.stub(input, "getGradleCommand").resolves("run --variant");
        const terminals: GradleRunnerTerminal[] = [];
        const openings: Promise<void>[] = [];
        sinon.stub(vscode.tasks, "executeTask").callsFake(async (task) => {
            const terminal = await createTerminal(task);
            terminals.push(terminal);
            openings.push(terminal.open());
            return { task, terminate: () => undefined };
        });
        const opts = { projectFolder: workspaceFolder.uri.fsPath, args: ["run", "--variant"] };
        let started = new Promise<RunBuildRequest>((resolve) => {
            onBuild = resolve;
        });
        const api = createApi();
        const apiBuild = api.runBuild({ ...opts, showOutputColors: false });
        const keys = [(await started).getCancellationKey()];
        for (let index = 0; index < 2; index++) {
            started = new Promise<RunBuildRequest>((resolve) => {
                onBuild = resolve;
            });
            await new RunBuildCommand(createRoots(), client).run();
            keys.push((await started).getCancellationKey());
        }
        keys.forEach((key) => registered.add(key));
        await terminals[1].handleInput("\x03");
        assert.deepStrictEqual(cancelled, [keys[2]], "Closing one command terminal must not cancel other invocations");
        await api.cancelRunBuild(opts);
        assert.deepStrictEqual(
            new Set(cancelled),
            new Set(keys),
            "Explicit API cancellation retains logical-key fan-out"
        );
        keys.forEach(finish);
        await Promise.all([apiBuild, ...openings]);
    });

    for (const phase of ["before connection", "during startup", "by the server"]) {
        it(`stops debug readiness without a debugger error when cancelled ${phase}`, async () => {
            removeCancellingTask.restore();
            const extension: vscode.Extension<unknown> = {
                id: "probe.java",
                extensionUri: workspaceFolder.uri,
                extensionPath: workspaceFolder.uri.fsPath,
                isActive: true,
                packageJSON: {},
                exports: undefined,
                activate: async () => undefined,
                extensionKind: vscode.ExtensionKind.Workspace,
            };
            sinon.stub(compat, "getJavaLanguageSupportExtension").returns(extension);
            sinon.stub(compat, "getJavaDebuggerExtension").returns(extension);
            sinon.stub(compat, "isJavaLanguageSupportExtensionActivated").returns(true);
            const errors = sinon.stub(vscode.window, "showErrorMessage").resolves();
            const debug = sinon.stub(vscode.debug, "startDebugging").resolves(true);
            const socket = new net.Socket();
            sinon.stub(socket, "setTimeout").returns(socket);
            sinon.stub(net, "connect").returns(socket);
            const executeTask = sinon.stub(vscode.tasks, "executeTask").callsFake(async (task) => ({
                task,
                terminate: () => undefined,
            }));
            executeCommand.callsFake(async (command, ...args) => {
                if (command === COMMAND_CANCEL_BUILD) {
                    await new CancelBuildCommand(client).run(args[0], args[1]);
                }
                return undefined;
            });
            if (phase !== "before connection") {
                await client.handleServerStart();
            }
            await new DebugTaskCommand(createRoots(), client).run(createTreeItem(createTask("tree-debug-cancel")));
            const task = executeTask.firstCall.args[0];
            sinon.stub(vscode.tasks, "taskExecutions").value([{ task, terminate: () => undefined }]);
            const terminal = await createTerminal(task);
            const closed = sinon.spy();
            terminal.onDidClose(closed);
            const runBuild = sinon.spy(client, "runBuild");
            const started = new Promise<RunBuildRequest>((resolve) => {
                onBuild = resolve;
            });
            const opening = terminal.open();
            await settle();
            assert.ok(runBuild.calledOnce);
            if (phase === "before connection") {
                await new CancelTreeItemTaskCommand().run(createTreeItem(task));
            } else {
                const request = await started;
                const key = request.getCancellationKey();
                if (phase === "during startup") {
                    registered.add(key);
                    await new CancelTreeItemTaskCommand().run(createTreeItem(task));
                    finish(key);
                } else {
                    const reply = new RunBuildReply();
                    reply.setCancelled(new Cancelled());
                    runs.get(key)!.resolve({ reply: encodeProto(reply.serializeBinary()) });
                    runs.delete(key);
                }
            }
            await opening;
            assert.ok(!errors.called, "Explicit cancellation must not be reported as debugger failure");
            assert.ok(!debug.called);
            assert.ok(closed.calledOnceWithExactly(0));
            assert.ok(socket.destroyed);
            await clock.tickAsync(10000);
            assert.ok(!taskUtil.isTaskCancelling(task));
            if (phase === "before connection") {
                await client.handleServerStart();
                await settle();
                assert.strictEqual(runs.size, 0);
            }
        });
    }

    for (const [entry, cancellationKey] of [
        ["build", undefined],
        ["build", "custom-api-key"],
        ["task", undefined],
        ["task", "custom-api-key"],
    ]) {
        it(`retains public ${entry} API cancellation with a ${
            cancellationKey ? "custom" : "derived"
        } logical key`, async () => {
            await client.handleServerStart();
            const api = createApi();
            const args = entry === "task" && !cancellationKey ? [] : ["--variant"];
            const opts = { projectFolder: workspaceFolder.uri.fsPath, args: ["run", ...args], cancellationKey };
            const started = new Promise<RunBuildRequest>((resolve) => {
                onBuild = resolve;
            });
            const completed =
                entry === "task"
                    ? api.runTask({ ...opts, taskName: "run", args, showOutputColors: false })
                    : api.runBuild({ ...opts, showOutputColors: false });
            const request = await started;
            assert.strictEqual(request.getJavaDebugPort(), 0);
            const firstAttempt = nextCancellation();
            const cancelling =
                entry === "task" ? api.cancelRunTask({ ...opts, taskName: "run" }) : api.cancelRunBuild(opts);
            await firstAttempt;
            await settle();
            registered.add(request.getCancellationKey());
            await clock.tickAsync(500);
            await settle();
            await cancelling;
            assert.deepStrictEqual(cancelled, [request.getCancellationKey()]);
            finish(request.getCancellationKey());
            await completed;
        });
    }

    it("retains cancel-all intent for builds whose tokens are not registered yet", async () => {
        const first = await start();
        const second = await start();
        const firstAttempt = nextCancellation();
        let acknowledged = false;
        const cancelling = createApi()
            .cancelAllBuilds()
            .then(() => {
                acknowledged = true;
            });
        await firstAttempt;
        await settle();
        assert.ok(acknowledged, "Aggregate cancellation must not block server restart on token registration");
        await cancelling;
        registered.add(first.key);
        registered.add(second.key);
        await clock.tickAsync(500);
        await settle();
        assert.deepStrictEqual(new Set(cancelled), new Set([first.key, second.key]));
        finish(first.key);
        finish(second.key);
        await Promise.all([first.completed, second.completed]);
    });

    it("disposes old progress cancellation before a task reuses its logical key", async () => {
        const first = await start();
        const firstProgress = progressTokens[progressTokens.length - 1];
        finish(first.key);
        await first.completed;
        const second = await start();
        registered.add(second.key);
        firstProgress.cancel();
        await clock.tickAsync(1000);
        await settle();
        assert.deepStrictEqual(cancelRequests, []);
        finish(second.key);
        await second.completed;
    });

    it("binds an already dispatched progress cancellation to its original invocation", async () => {
        const first = await start();
        let forwardCancellation: () => Promise<void> = async () => undefined;
        executeCommand.callsFake(async (command, ...args) => {
            if (command === COMMAND_CANCEL_BUILD) {
                await new Promise<void>((resolve) => {
                    forwardCancellation = async () => {
                        await client.cancelBuild(args[0], args[1]);
                        resolve();
                    };
                });
            }
            return undefined;
        });
        progressTokens[progressTokens.length - 1].cancel();
        finish(first.key);
        await first.completed;
        const second = await start();
        registered.add(second.key);
        await forwardCancellation();
        assert.deepStrictEqual(cancelRequests, [first.key]);
        assert.deepStrictEqual(cancelled, []);
        finish(second.key);
        await second.completed;
    });

    it("stops cancellation retries when the client is disposed", async () => {
        const build = await start();
        const rejected = assert.rejects(build.completed);
        const firstAttempt = nextCancellation();
        const cancelling = client.cancelBuild("build-key");
        await firstAttempt;
        await settle();
        client.dispose();
        await rejected;
        await cancelling;
        const attempts = cancelRequests.length;
        await clock.tickAsync(10000);
        assert.strictEqual(cancelRequests.length, attempts);
        assert.strictEqual(clock.countTimers(), 0);
    });

    it("logs cancellation transport failures and retries while the build remains active", async () => {
        const build = await start();
        cancelReply = () => Promise.reject(new Error("Cancellation temporarily unavailable"));
        const firstAttempt = nextCancellation();
        const cancelling = client.cancelBuild("build-key");
        await firstAttempt;
        await settle();
        assert.ok(logError.calledWith("Error cancelling build:", sinon.match("Cancellation temporarily unavailable")));
        cancelReply = acknowledgeCancellation;
        registered.add(build.key);
        await clock.tickAsync(500);
        await cancelling;
        assert.deepStrictEqual(cancelled, [build.key]);
        finish(build.key);
        await build.completed;
    });
});
