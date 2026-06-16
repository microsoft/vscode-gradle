import * as assert from "assert";
import type * as cp from "child_process";
import { EventEmitter } from "events";
import * as sinon from "sinon";
import { SinonStub } from "sinon";
import * as vscode from "vscode";
import { GradleServer } from "../../server";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

type GradleServerInternals = {
    process?: cp.ChildProcessWithoutNullStreams;
    processRunning: boolean;
    ready: boolean;
    pipeListener?: { dispose(): void };
    bspProxy: { closeConnection(): void };
    _onDidStop: { fire(value: null): void };
    showRestartMessage: SinonStub<[string?], Promise<void>>;
    handleProcessError(process: cp.ChildProcessWithoutNullStreams, error: Error): Promise<void>;
    handleUnexpectedExit(
        code: number | null,
        signal: NodeJS.Signals | null,
        requiresExtensionHostRestart: boolean
    ): Promise<void>;
};

describe(suiteName("GradleServer recovery"), () => {
    afterEach(() => {
        sinon.restore();
    });

    it("deduplicates concurrent restart prompts", async () => {
        let resolvePrompt: (selection: string | undefined) => void = () => undefined;
        const promptSelection = new Promise<string | undefined>((resolve) => {
            resolvePrompt = resolve;
        });
        const showErrorMessageStub = (sinon.stub(vscode.window, "showErrorMessage") as SinonStub).returns(
            promptSelection
        );
        const server = Object.create(GradleServer.prototype) as GradleServer;

        const firstPrompt = server.showRestartMessage("first failure");
        const secondPrompt = server.showRestartMessage("second failure");

        assert.strictEqual(showErrorMessageStub.calledOnce, true);
        resolvePrompt(undefined);
        await Promise.all([firstPrompt, secondPrompt]);
        assert.strictEqual(showErrorMessageStub.calledOnce, true);
    });

    it("uses extension host restart when prompting with an active BSP importer session", async () => {
        const showErrorMessageStub = (sinon.stub(vscode.window, "showErrorMessage") as SinonStub).resolves(
            "Restart Extension Host"
        );
        const executeCommandStub = sinon.stub(vscode.commands, "executeCommand").resolves();
        const server = Object.assign(Object.create(GradleServer.prototype), {
            bspProxy: { hasImporterSession: sinon.stub().returns(true) },
        }) as GradleServer;

        await server.showRestartMessage("Gradle server failed.");

        assert.strictEqual(showErrorMessageStub.calledOnce, true);
        const [message, action] = showErrorMessageStub.firstCall.args;
        assert.match(String(message), /extension host/i);
        assert.strictEqual(action, "Restart Extension Host");
        assert.strictEqual(executeCommandStub.calledOnceWith("workbench.action.restartExtensionHost"), true);
    });

    it("routes direct restart to the extension host when BSP importer is active", async () => {
        const executeCommandStub = sinon.stub(vscode.commands, "executeCommand").resolves();
        const logger = { info: sinon.stub() };
        const server = Object.assign(Object.create(GradleServer.prototype), {
            bspProxy: { hasImporterSession: sinon.stub().returns(true) },
            logger,
        }) as GradleServer;

        await server.restart();

        assert.strictEqual(logger.info.calledOnce, true);
        assert.strictEqual(executeCommandStub.calledOnceWith("workbench.action.restartExtensionHost"), true);
    });

    it("uses extension host restart for unexpected exits when BSP importer is active", async () => {
        const showWarningMessageStub = (sinon.stub(vscode.window, "showWarningMessage") as SinonStub).resolves(
            "Restart Extension Host"
        );
        const executeCommandStub = sinon.stub(vscode.commands, "executeCommand").resolves();
        const server = Object.assign(Object.create(GradleServer.prototype), {
            stderrTail: [],
            logger: { getChannel: sinon.stub() },
        }) as GradleServerInternals;

        await server.handleUnexpectedExit(1, null, true);

        assert.strictEqual(showWarningMessageStub.calledOnce, true);
        assert.strictEqual(showWarningMessageStub.firstCall.args[1], "Restart Extension Host");
        assert.strictEqual(executeCommandStub.calledOnceWith("workbench.action.restartExtensionHost"), true);
    });

    it("cleans up pending startup state when the child process emits error", async () => {
        const childProcess = new EventEmitter() as cp.ChildProcessWithoutNullStreams;
        const pipeListener = { dispose: sinon.stub() };
        const bspProxy = { closeConnection: sinon.stub() };
        const onDidStop = { fire: sinon.stub() };
        const server = Object.assign(Object.create(GradleServer.prototype), {
            process: childProcess,
            processRunning: true,
            ready: true,
            pipeListener,
            bspProxy,
            _onDidStop: onDidStop,
            showRestartMessage: sinon.stub().resolves(),
        }) as GradleServerInternals;

        await server.handleProcessError(childProcess, new Error("spawn failed"));

        assert.strictEqual(server.ready, false);
        assert.strictEqual(server.processRunning, false);
        assert.strictEqual(server.process, undefined);
        assert.strictEqual(server.pipeListener, undefined);
        assert.strictEqual(pipeListener.dispose.calledOnce, true);
        assert.strictEqual(bspProxy.closeConnection.calledOnce, true);
        assert.strictEqual(onDidStop.fire.calledOnceWith(null), true);
        const restartReason = server.showRestartMessage.firstCall.args[0];
        if (typeof restartReason !== "string") {
            assert.fail("Expected restart prompt reason");
        }
        assert.match(restartReason, /failed to start/i);
    });
});
