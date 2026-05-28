// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as net from "net";
import { createMessageConnection, MessageConnection } from "vscode-jsonrpc/node";
import { SocketMessageReader, SocketMessageWriter } from "vscode-jsonrpc/node";

/**
 * Loopback listener for the JSON-RPC task transport.
 *
 * The extension binds an ephemeral port on `127.0.0.1`, then spawns the
 * `gradle-server` JVM with `--port=<that-port>`. The JVM connects back as
 * a TCP client (`TaskSocketServer` on the Java side) and the resulting
 * socket is wrapped in an LSP4J-compatible `MessageConnection`.
 *
 * Only the first inbound connection is accepted; subsequent connection
 * attempts are rejected and the listener is closed.
 *
 * If the JVM fails to connect within `connectTimeoutMs` the
 * `connection` promise rejects with an error. Callers must surface this
 * failure as a "server failed to start" condition.
 */

const LOOPBACK = "127.0.0.1";
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

export interface LoopbackListener {
    /** Ephemeral port the JVM should be told to connect back to. */
    readonly port: number;
    /** Resolves with the `MessageConnection` once the JVM connects; rejects on timeout or socket error. */
    readonly connection: Promise<MessageConnection>;
    /** Tear down the listener and (if connected) the inbound socket. Safe to call repeatedly. */
    dispose(): void;
}

export interface LoopbackListenerOptions {
    connectTimeoutMs?: number;
}

export async function createLoopbackListener(options: LoopbackListenerOptions = {}): Promise<LoopbackListener> {
    const timeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    const server = net.createServer();

    const port = await new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, LOOPBACK, () => {
            const addr = server.address();
            if (typeof addr === "object" && addr !== null) {
                resolve(addr.port);
            } else {
                reject(new Error(`Unexpected loopback listener address: ${String(addr)}`));
            }
        });
    });

    let acceptedSocket: net.Socket | undefined;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let disposed = false;

    const connection = new Promise<MessageConnection>((resolve, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`Timed out after ${timeoutMs}ms waiting for gradle-server to connect on port ${port}`));
            try {
                server.close();
            } catch {
                // best-effort; nothing actionable
            }
        }, timeoutMs);

        server.on("connection", (socket) => {
            if (acceptedSocket) {
                // Already paired with a JVM; reject extra connections.
                socket.destroy();
                return;
            }
            acceptedSocket = socket;
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = undefined;
            }
            // Stop accepting further connections; the listener has served its purpose.
            server.close();

            const reader = new SocketMessageReader(socket);
            const writer = new SocketMessageWriter(socket);
            const conn = createMessageConnection(reader, writer);
            resolve(conn);
        });

        server.on("error", (err) => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = undefined;
            }
            reject(err);
        });
    });

    return {
        port,
        connection,
        dispose: () => {
            if (disposed) {
                return;
            }
            disposed = true;
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = undefined;
            }
            try {
                server.close();
            } catch {
                // best-effort
            }
            if (acceptedSocket && !acceptedSocket.destroyed) {
                acceptedSocket.destroy();
            }
        },
    };
}
