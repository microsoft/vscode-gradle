// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as net from "net";
import * as sinon from "sinon";
import type { Logger as JsonRpcLogger } from "vscode-jsonrpc";
import { createLoopbackListener, LoopbackListener } from "../../../transport/jsonrpc";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

function frame(body: string): string {
    return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

describe(suiteName("createLoopbackListener"), () => {
    let listener: LoopbackListener | undefined;
    let clientSock: net.Socket | undefined;

    afterEach(() => {
        if (clientSock && !clientSock.destroyed) {
            clientSock.destroy();
        }
        clientSock = undefined;
        listener?.dispose();
        listener = undefined;
    });

    it("binds an ephemeral loopback port and resolves the connection promise on first inbound socket", async () => {
        listener = await createLoopbackListener({ connectTimeoutMs: 2_000 });
        assert.ok(listener.port > 0 && listener.port < 65_536, `expected ephemeral port, got ${listener.port}`);

        clientSock = net.connect(listener.port, "127.0.0.1");
        await new Promise<void>((resolve, reject) => {
            clientSock!.once("connect", () => resolve());
            clientSock!.once("error", reject);
        });

        const connection = await listener.connection;
        assert.ok(connection, "expected a MessageConnection to resolve from the listener");
        connection.dispose();
    });

    it("disables Nagle and enables TCP keepalive on the accepted gradle-server socket", async () => {
        // Spy on the prototype so we observe the configuration applied to the
        // inbound (accepted) socket. The test client never sets these itself,
        // so any matching call must originate from the listener. Use spies
        // (call-through) rather than stubs so the real socket still works.
        const noDelaySpy = sinon.spy(net.Socket.prototype, "setNoDelay");
        const keepAliveSpy = sinon.spy(net.Socket.prototype, "setKeepAlive");
        try {
            listener = await createLoopbackListener({ connectTimeoutMs: 2_000 });

            clientSock = net.connect(listener.port, "127.0.0.1");
            await new Promise<void>((resolve, reject) => {
                clientSock!.once("connect", () => resolve());
                clientSock!.once("error", reject);
            });

            const connection = await listener.connection;

            assert.ok(noDelaySpy.calledWith(true), "expected setNoDelay(true) on the accepted gradle-server socket");
            assert.ok(
                keepAliveSpy
                    .getCalls()
                    .some((call) => call.args[0] === true && typeof call.args[1] === "number" && call.args[1] > 0),
                `expected setKeepAlive(true, <ms>) on the accepted gradle-server socket, got: ${JSON.stringify(
                    keepAliveSpy.getCalls().map((call) => call.args)
                )}`
            );

            connection.dispose();
        } finally {
            noDelaySpy.restore();
            keepAliveSpy.restore();
        }
    });

    it("rejects the connection promise when dispose() is called before any JVM connects", async () => {
        listener = await createLoopbackListener({ connectTimeoutMs: 10_000 });

        // Simulate `GradleServer`'s exit handler tearing the listener down
        // because the JVM failed to spawn — without this rejection, awaiters
        // (TaskServerClient.connectToServer) hang forever.
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

        listener = await createLoopbackListener({ logger: spy, connectTimeoutMs: 2_000 });

        clientSock = net.connect(listener.port, "127.0.0.1");
        await new Promise<void>((resolve, reject) => {
            clientSock!.once("connect", () => resolve());
            clientSock!.once("error", reject);
        });

        const connection = await listener.connection;
        connection.listen();

        // A framed JSON-RPC payload that is neither a request, response, nor
        // notification. vscode-jsonrpc's connection routes this to
        // `logger.error("Received message which is neither a response nor a notification ...")`.
        // See node_modules/vscode-jsonrpc/lib/common/connection.js (around the
        // "Received message which is neither" branch).
        clientSock.write(frame(JSON.stringify({ jsonrpc: "2.0" })));

        // Allow the message pump to deliver the malformed payload.
        await new Promise((resolve) => setTimeout(resolve, 100));

        assert.ok(
            errors.some((m) => /neither a response nor a notification/i.test(m)),
            `expected protocol diagnostic to reach the spy Logger, got: ${JSON.stringify(errors)}`
        );

        connection.dispose();
    });
});
