import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { PassThrough } from "stream";
import { createMessageConnection, RequestType, StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
import { TaskServerClient } from "../../client";
import { COMMAND_CANCEL_BUILD } from "../../commands";
import { logger } from "../../logger";
import {
    CancelBuildReply,
    CancelBuildRequest,
    CancelBuildsReply,
    RunBuildReply,
    RunBuildRequest,
    RunBuildResult,
} from "../../proto/gradle_pb";
import { GradleServer } from "../../server";
import { RootProject } from "../../rootProject/RootProject";
import * as taskUtil from "../../tasks/taskUtil";
import { GradleRunnerTerminal } from "../../terminal";
import * as util from "../../util";
import { decodeProto, encodeProto } from "../../transport/jsonrpc";
import { GradleRequestParams, GradleResponse } from "../../transport/jsonrpc/types";
import { buildMockTaskDefinition, buildMockWorkspaceFolder, getSuiteName } from "../testUtil";

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
        sinon.stub(taskUtil, "restartQueuedTask").resolves();
        sinon.stub(taskUtil, "removeCancellingTask");
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

    it("retains cancel-all intent for builds whose tokens are not registered yet", async () => {
        const first = await start();
        const second = await start();
        const firstAttempt = nextCancellation();
        const cancelling = client.cancelBuilds();
        await firstAttempt;
        await settle();
        registered.add(first.key);
        registered.add(second.key);
        await clock.tickAsync(500);
        await settle();
        await cancelling;
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
