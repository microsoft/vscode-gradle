// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as net from "net";
import * as sinon from "sinon";
import * as telemetry from "vscode-extension-telemetry-wrapper";
import type { Logger as JsonRpcLogger, Message, MessageConnection } from "vscode-jsonrpc";
import { createPipeListener, PipeListener } from "../../../transport/jsonrpc";
import { SafeSocketMessageWriter } from "../../../transport/jsonrpc/pipeServer";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

function frame(body: string): string {
    return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

describe(suiteName("createPipeListener"), () => {
    let listener: PipeListener | undefined;
    let clientSocks: net.Socket[] = [];
    let sendInfoStub: sinon.SinonStub;

    beforeEach(() => {
        sendInfoStub = sinon.stub(telemetry, "sendInfo");
    });

    afterEach(async () => {
        for (const clientSock of clientSocks) {
            if (!clientSock.destroyed) {
                clientSock.destroy();
            }
        }
        clientSocks = [];
        listener?.dispose();
        listener = undefined;
        // dispose() destroys the socket and its `close` handler emits telemetry on
        // a later tick; let those callbacks run while the stub is still installed
        // so restore() does not expose the real telemetry implementation.
        await new Promise((resolve) => setImmediate(resolve));
        sinon.restore();
    });

    it("binds a task pipe and resolves the connection promise on first inbound socket", async () => {
        listener = await createPipeListener({ connectTimeoutMs: 2_000 });
        assert.ok(listener.pipePath, "expected a pipe path");

        await connectClient(listener.pipePath);

        const connection = await listener.connection;
        assert.ok(connection, "expected a MessageConnection to resolve from the listener");
        connection.dispose();
    });

    if (process.platform !== "win32") {
        it("keeps the Unix socket path available for reconnects until dispose", async () => {
            listener = await createPipeListener({ connectTimeoutMs: 2_000 });
            const pipePath = listener.pipePath;
            assert.ok(fs.existsSync(pipePath), "expected Unix socket path to exist while listening");

            await connectClient(pipePath);

            const connection = await listener.connection;
            assert.ok(connection, "expected a MessageConnection to resolve from the listener");
            assert.strictEqual(fs.existsSync(pipePath), true, "expected Unix socket path to stay available");
            connection.dispose();

            listener.dispose();
            listener = undefined;
            assert.strictEqual(fs.existsSync(pipePath), false, "expected Unix socket path to be unlinked on dispose");
        });
    }

    it("accepts a new task connection after the previous socket closes", async () => {
        listener = await createPipeListener({ connectTimeoutMs: 2_000 });

        const firstSocket = await connectClient(listener.pipePath);
        const firstConnection = await listener.connection;
        assert.ok(firstConnection, "expected the first task connection");

        firstSocket.destroy();
        firstConnection.dispose();

        const secondSocket = await connectClient(listener.pipePath);
        const secondConnection = await listener.connection;
        assert.ok(secondSocket, "expected the second socket to connect to the same pipe path");
        assert.ok(secondConnection, "expected the second task connection");
        assert.notStrictEqual(secondConnection, firstConnection);
        secondConnection.dispose();
    });

    it("returns the latest queued connection when multiple sockets arrive before a waiter", async () => {
        listener = await createPipeListener({ connectTimeoutMs: 2_000 });
        const seenConnections: MessageConnection[] = [];
        const observedConnections = new Promise<void>((resolve) => {
            listener!.onConnection((connection) => {
                seenConnections.push(connection);
                if (seenConnections.length === 2) {
                    resolve();
                }
            });
        });

        await connectClient(listener.pipePath);
        await connectClient(listener.pipePath);
        await observedConnections;

        assert.strictEqual(seenConnections.length, 2, "expected both inbound connections to be observed");
        const connection = await listener.connection;
        assert.strictEqual(connection, seenConnections[1], "expected the latest queued connection");

        connection.dispose();
    });

    it("rejects the connection promise when dispose() is called before any JVM connects", async () => {
        listener = await createPipeListener({ connectTimeoutMs: 10_000 });

        const pending = listener.connection;
        listener.dispose();
        listener = undefined;

        await assert.rejects(pending, (err: Error) => {
            assert.match(err.message, /disposed before gradle-server connected/i);
            return true;
        });
    });

    it("uses a generic dispose reason after a task connection was established", async () => {
        listener = await createPipeListener({ connectTimeoutMs: 2_000 });
        await connectClient(listener.pipePath);
        const connection = await listener.connection;
        connection.dispose();

        const pending = listener.connection;
        listener.dispose();
        listener = undefined;

        await assert.rejects(pending, (err: Error) => {
            assert.strictEqual(err.message, "Task pipe listener disposed");
            return true;
        });
    });

    it("forwards vscode-jsonrpc protocol diagnostics to the supplied Logger", async () => {
        const errors: string[] = [];
        const spy: JsonRpcLogger = {
            error: (message: string) => errors.push(message),
            warn: () => {
                /* no-op */
            },
            info: () => {
                /* no-op */
            },
            log: () => {
                /* no-op */
            },
        };

        listener = await createPipeListener({ logger: spy, connectTimeoutMs: 2_000 });

        const clientSock = await connectClient(listener.pipePath);

        const connection = await listener.connection;
        connection.listen();

        clientSock.write(frame(JSON.stringify({ jsonrpc: "2.0" })));

        // Allow the message pump to deliver the malformed payload.
        await new Promise((resolve) => setTimeout(resolve, 100));

        assert.ok(
            errors.some((m) => /neither a response nor a notification/i.test(m)),
            `expected protocol diagnostic to reach the spy Logger, got: ${JSON.stringify(errors)}`
        );

        connection.dispose();
    });

    it("emits taskPipeDisconnected with outcome 'disposed' when the listener is torn down", async () => {
        listener = await createPipeListener({ connectTimeoutMs: 2_000 });
        await connectClient(listener.pipePath);
        await listener.connection;

        listener.dispose();
        listener = undefined;

        await waitFor(() => disconnectCalls().length >= 1);
        const last = disconnectCalls().pop()!;
        assert.strictEqual(last.outcome, "disposed", "expected an extension-initiated teardown to be classified");
        assert.strictEqual(typeof last.durationMs, "number", "expected the connection lifetime to be recorded");
    });

    it("emits taskPipeDisconnected when the JVM side closes the task socket", async () => {
        listener = await createPipeListener({ connectTimeoutMs: 2_000 });
        const clientSock = await connectClient(listener.pipePath);
        await listener.connection;

        clientSock.end();

        await waitFor(() => disconnectCalls().some((d) => d.outcome !== "disposed"));
        const drop = disconnectCalls().find((d) => d.outcome !== "disposed")!;
        assert.ok(
            drop.outcome === "peerClosed" || drop.outcome === "error",
            `expected a peer-initiated drop, got outcome=${drop.outcome}`
        );
    });

    function disconnectCalls(): Array<{ outcome: string; durationMs: number; hadError: boolean }> {
        return sendInfoStub
            .getCalls()
            .filter((call) => (call.args[1] as { kind?: string } | undefined)?.kind === "taskPipeDisconnected")
            .map((call) => JSON.parse((call.args[1] as { dataMsg: string }).dataMsg));
    }

    async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
        const start = Date.now();
        while (!predicate()) {
            if (Date.now() - start > timeoutMs) {
                throw new Error("timed out waiting for the expected telemetry");
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    }

    async function connectClient(pipePath: string): Promise<net.Socket> {
        const socket = net.connect(pipePath);
        clientSocks.push(socket);
        await new Promise<void>((resolve, reject) => {
            socket.once("connect", () => resolve());
            socket.once("error", reject);
        });
        return socket;
    }
});

describe(suiteName("SafeSocketMessageWriter"), () => {
    let server: net.Server | undefined;
    let pairSocks: net.Socket[] = [];

    const ping: Message = { jsonrpc: "2.0", method: "ping" } as Message;

    afterEach(async () => {
        for (const sock of pairSocks) {
            if (!sock.destroyed) {
                sock.destroy();
            }
        }
        pairSocks = [];
        if (server) {
            await new Promise<void>((resolve) => server!.close(() => resolve()));
            server = undefined;
        }
        sinon.restore();
    });

    // Establish a connected loopback socket pair: `local` is what the writer
    // writes to, `remote` is the peer that receives the framed bytes.
    function connectPair(): Promise<{ local: net.Socket; remote: net.Socket }> {
        return new Promise((resolve, reject) => {
            let local!: net.Socket;
            const srv = net.createServer((remote) => {
                pairSocks.push(remote);
                resolve({ local, remote });
            });
            server = srv;
            srv.once("error", reject);
            srv.listen(0, "127.0.0.1", () => {
                const { port } = srv.address() as net.AddressInfo;
                local = net.connect(port, "127.0.0.1");
                pairSocks.push(local);
                local.once("error", () => {
                    /* ignore; teardown destroys the socket */
                });
            });
        });
    }

    it("delivers a message while the socket is writable", async () => {
        const { local, remote } = await connectPair();
        const writer = new SafeSocketMessageWriter(local);
        const sendInfoStub = sinon.stub(telemetry, "sendInfo");
        let sawError = false;
        writer.onError(() => (sawError = true));

        const received = new Promise<string>((resolve) => {
            remote.once("data", (data: Buffer) => resolve(data.toString("utf8")));
        });

        await writer.write(ping);

        const payload = await received;
        assert.ok(payload.includes("ping"), `expected the framed message to arrive, got: ${payload}`);
        assert.strictEqual(sawError, false, "did not expect an error while the socket was writable");
        assert.strictEqual(sendInfoStub.called, false, "did not expect telemetry for a successful write");
    });

    it("does not throw 'write after end' once the socket is destroyed", async () => {
        const { local } = await connectPair();
        const writer = new SafeSocketMessageWriter(local);
        const sendInfoStub = sinon.stub(telemetry, "sendInfo");
        const errors: Error[] = [];
        writer.onError(([err]) => errors.push(err));

        local.destroy();
        // Allow Node to mark the socket destroyed before we attempt the write.
        await new Promise((resolve) => setImmediate(resolve));

        await assert.doesNotReject(
            writer.write(ping),
            "writing to a destroyed task pipe must resolve, not throw write-after-end"
        );
        assert.ok(errors.length >= 1, "expected the write failure to be routed through the onError event");
        assert.ok(
            sendInfoStub.calledWith("", sinon.match({ kind: "taskPipeWriteAfterEnd" })),
            "expected taskPipeWriteAfterEnd telemetry to be reported once the pipe is torn down"
        );
    });

    it("reports the torn-down pipe telemetry at most once per writer", async () => {
        const { local } = await connectPair();
        const writer = new SafeSocketMessageWriter(local);
        const sendInfoStub = sinon.stub(telemetry, "sendInfo");
        writer.onError(() => {
            /* swallow; assertions below cover the telemetry */
        });

        local.destroy();
        await new Promise((resolve) => setImmediate(resolve));

        await writer.write(ping);
        await writer.write(ping);

        const writeAfterEndCalls = sendInfoStub
            .getCalls()
            .filter((call) => call.args[1] && (call.args[1] as { kind?: string }).kind === "taskPipeWriteAfterEnd");
        assert.strictEqual(writeAfterEndCalls.length, 1, "expected taskPipeWriteAfterEnd to be reported only once");
    });
});
