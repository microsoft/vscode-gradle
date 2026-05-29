// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as net from "net";
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
