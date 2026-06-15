/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { TaskServerClient } from "../../client/TaskServerClient";
import { logger } from "../../logger";
import { GradleServer } from "../../server";
import { buildMockOutputChannel } from "../testUtil";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

function createStatusBarItem(): vscode.StatusBarItem {
    return {
        hide: sinon.stub(),
        show: sinon.stub(),
        dispose: sinon.stub(),
    } as unknown as vscode.StatusBarItem;
}

function createServer(options: {
    connection: Promise<unknown>;
    autoRestartPending?: boolean;
    processRunning?: boolean;
}): {
    server: GradleServer;
    showRestartMessage: sinon.SinonStub;
} {
    const showRestartMessage = sinon.stub().resolves();
    return {
        server: {
            onDidStart: sinon.stub().returns({ dispose: sinon.stub() }),
            onDidStop: sinon.stub().returns({ dispose: sinon.stub() }),
            awaitTaskConnection: sinon.stub().returns(options.connection),
            isAutoRestartPending: sinon.stub().returns(options.autoRestartPending ?? false),
            isProcessRunning: sinon.stub().returns(options.processRunning ?? true),
            showRestartMessage,
        } as unknown as GradleServer,
        showRestartMessage,
    };
}

describe(suiteName("TaskServerClient recovery"), () => {
    let withProgressStub: sinon.SinonStub;

    beforeEach(() => {
        logger.reset();
        logger.setLoggingChannel(buildMockOutputChannel());
        withProgressStub = sinon.stub(vscode.window, "withProgress").callsFake((_options, task) => {
            const progress = { report: sinon.stub() };
            const tokenSource = new vscode.CancellationTokenSource();
            return task(progress, tokenSource.token) as Thenable<unknown>;
        });
    });

    afterEach(() => {
        sinon.restore();
        logger.reset();
    });

    it("prompts to restart the Gradle server when pipe connection fails while the JVM is running", async () => {
        const { server, showRestartMessage } = createServer({
            connection: Promise.reject(new Error("pipe connect timeout")),
            processRunning: true,
        });
        const client = new TaskServerClient(server, createStatusBarItem());

        await client.handleServerStart();

        assert.strictEqual(withProgressStub.calledOnce, true);
        assert.strictEqual(showRestartMessage.calledOnce, true);
        assert.match(showRestartMessage.firstCall.args[0], /could not connect to the task server/i);
        assert.match(showRestartMessage.firstCall.args[0], /pipe connect timeout/i);
        client.dispose();
    });

    it("does not show a second prompt when auto-restart is already pending", async () => {
        const { server, showRestartMessage } = createServer({
            connection: Promise.reject(new Error("listener disposed")),
            autoRestartPending: true,
            processRunning: true,
        });
        const client = new TaskServerClient(server, createStatusBarItem());

        await client.handleServerStart();

        assert.strictEqual(showRestartMessage.called, false);
        client.dispose();
    });

    it("lets the server exit handler own the prompt when the JVM already exited", async () => {
        const { server, showRestartMessage } = createServer({
            connection: Promise.reject(new Error("listener disposed")),
            processRunning: false,
        });
        const client = new TaskServerClient(server, createStatusBarItem());

        await client.handleServerStart();

        assert.strictEqual(showRestartMessage.called, false);
        client.dispose();
    });
});
