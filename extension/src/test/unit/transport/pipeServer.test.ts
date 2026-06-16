// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as net from "net";
import type { Logger as JsonRpcLogger, MessageConnection } from "vscode-jsonrpc";
import { createPipeListener, PipeListener } from "../../../transport/jsonrpc";

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

    afterEach(() => {
        for (const clientSock of clientSocks) {
            if (!clientSock.destroyed) {
                clientSock.destroy();
            }
        }
        clientSocks = [];
        listener?.dispose();
        listener = undefined;
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
