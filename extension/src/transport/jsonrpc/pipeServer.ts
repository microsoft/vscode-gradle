// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as net from "net";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { createMessageConnection, MessageConnection } from "vscode-jsonrpc/node";
import { SocketMessageReader, SocketMessageWriter } from "vscode-jsonrpc/node";
import type { Logger as JsonRpcLogger } from "vscode-jsonrpc";
import { getRandomPipeName } from "../../util/generateRandomPipeName";

/**
 * Named-pipe / Unix-domain-socket listener for the JSON-RPC task transport.
 *
 * The extension creates the pipe first, then spawns the `gradle-server` JVM with
 * `--pipe=<path>`. The JVM connects back as a pipe client (`TaskPipeServer` on
 * the Java side) and the resulting stream is wrapped in an LSP4J-compatible
 * `MessageConnection`.
 */

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

export interface PipeListener {
    /** Pipe path the JVM should be told to connect back to. */
    readonly pipePath: string;
    /** Resolves with the `MessageConnection` once the JVM connects; rejects on timeout or socket error. */
    readonly connection: Promise<MessageConnection>;
    /** Tear down the listener and (if connected) the inbound socket. Safe to call repeatedly. */
    dispose(): void;
}

export interface PipeListenerOptions {
    connectTimeoutMs?: number;
    /**
     * Optional logger forwarded to {@link createMessageConnection}. Receives
     * protocol-level diagnostics (framing errors, malformed messages, etc.).
     */
    logger?: JsonRpcLogger;
}

export async function createPipeListener(options: PipeListenerOptions = {}): Promise<PipeListener> {
    const timeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    const pipePath = getRandomPipeName();
    if (!pipePath) {
        const err = new Error("Failed to generate gradle-server task pipe path");
        reportPipeFailure("taskPipeSetupFailure", err.message);
        throw err;
    }

    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
        const onError = (err: Error): void => {
            cleanupPipePath(pipePath);
            reportPipeFailure("taskPipeSetupFailure", err.message);
            reject(err);
        };
        server.once("error", onError);
        server.listen(pipePath, () => {
            server.off("error", onError);
            resolve();
        });
    });

    let acceptedSocket: net.Socket | undefined;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let disposed = false;
    let rejectConnection: ((reason: Error) => void) | undefined;

    const connection = new Promise<MessageConnection>((resolve, reject) => {
        rejectConnection = reject;
        timeoutHandle = setTimeout(() => {
            const err = new Error(`Timed out after ${timeoutMs}ms waiting for gradle-server to connect to task pipe`);
            rejectConnection = undefined;
            reportPipeFailure("taskPipeConnectTimeout", err.message);
            reject(err);
            closeServer(server, pipePath);
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
            rejectConnection = undefined;
            // Stop accepting further connections; the listener has served its purpose.
            closeServer(server, pipePath);

            const reader = new SocketMessageReader(socket);
            const writer = new SocketMessageWriter(socket);

            socket.on("error", (socketErr) => {
                options.logger?.error(`gradle-server task pipe error: ${socketErr.message}`);
                reportPipeFailure("taskPipeConnectionClosed", socketErr.message);
            });
            socket.on("close", (hadError) => {
                options.logger?.info(`gradle-server task pipe closed${hadError ? " after error" : ""}`);
            });

            const conn = createMessageConnection(reader, writer, options.logger);
            resolve(conn);
        });

        server.on("error", (err) => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = undefined;
            }
            rejectConnection = undefined;
            reportPipeFailure("taskPipeSetupFailure", err.message);
            reject(err);
        });
    });

    return {
        pipePath,
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
            if (rejectConnection) {
                const reject = rejectConnection;
                rejectConnection = undefined;
                reject(new Error("Task pipe listener disposed before gradle-server connected"));
            }
            closeServer(server, pipePath);
            if (acceptedSocket && !acceptedSocket.destroyed) {
                acceptedSocket.destroy();
            }
        },
    };
}

function closeServer(server: net.Server, pipePath: string): void {
    try {
        server.close(() => cleanupPipePath(pipePath));
    } catch {
        cleanupPipePath(pipePath);
    }
}

function cleanupPipePath(pipePath: string): void {
    if (process.platform === "win32") {
        return;
    }
    try {
        fs.unlinkSync(pipePath);
    } catch {
        // best-effort; the socket file may already be gone
    }
}

function reportPipeFailure(kind: string, message: string): void {
    sendInfo("", {
        kind,
        dataMsg: message,
        transport: "pipe",
    });
}
