// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as net from "net";
import type { Logger as JsonRpcLogger } from "vscode-jsonrpc";
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
    let clientSock: net.Socket | undefined;

    afterEach(() => {
        if (clientSock && !clientSock.destroyed) {
            clientSock.destroy();
        }
        clientSock = undefined;
        listener?.dispose();
        listener = undefined;
    });

    it("binds a task pipe and resolves the connection promise on first inbound socket", async () => {
        listener = await createPipeListener({ connectTimeoutMs: 2_000 });
        assert.ok(listener.pipePath, "expected a pipe path");

        clientSock = net.connect(listener.pipePath);
        await new Promise<void>((resolve, reject) => {
            clientSock!.once("connect", () => resolve());
            clientSock!.once("error", reject);
        });

        const connection = await listener.connection;
        assert.ok(connection, "expected a MessageConnection to resolve from the listener");
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

        clientSock = net.connect(listener.pipePath);
        await new Promise<void>((resolve, reject) => {
            clientSock!.once("connect", () => resolve());
            clientSock!.once("error", reject);
        });

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
});
