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
