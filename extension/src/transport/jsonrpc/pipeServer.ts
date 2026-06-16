// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as net from "net";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { Emitter, Event } from "vscode-jsonrpc";
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
 * `MessageConnection`. The listener stays bound for the JVM lifetime so the
 * task channel can reconnect without restarting the JVM.
 */

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

export interface PipeListener {
    /** Pipe path the JVM should be told to connect back to. */
    readonly pipePath: string;
    /** Resolves with the next `MessageConnection` once the JVM connects; rejects on timeout or dispose. */
    readonly connection: Promise<MessageConnection>;
    /** Fires every time the JVM establishes a new task transport session. */
    readonly onConnection: Event<MessageConnection>;
    /** Wait for the next task transport session. */
    waitForConnection(connectTimeoutMs?: number): Promise<MessageConnection>;
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

    let activeSocket: net.Socket | undefined;
    let disposed = false;
    const pendingConnections: MessageConnection[] = [];
    const pendingWaiters: Array<{
        resolve: (connection: MessageConnection) => void;
        reject: (reason: Error) => void;
        timeoutHandle?: NodeJS.Timeout;
    }> = [];
    const onConnectionEmitter = new Emitter<MessageConnection>();

    const waitForConnection = (connectTimeoutMs = timeoutMs): Promise<MessageConnection> => {
        if (disposed) {
            return Promise.reject(new Error("Task pipe listener disposed before gradle-server connected"));
        }
        const queuedConnection = pendingConnections.shift();
        if (queuedConnection) {
            return Promise.resolve(queuedConnection);
        }
        return new Promise<MessageConnection>((resolve, reject) => {
            const waiter = { resolve, reject, timeoutHandle: undefined as NodeJS.Timeout | undefined };
            if (connectTimeoutMs > 0) {
                waiter.timeoutHandle = setTimeout(() => {
                    const waiterIndex = pendingWaiters.indexOf(waiter);
                    if (waiterIndex >= 0) {
                        pendingWaiters.splice(waiterIndex, 1);
                    }
                    const err = new Error(
                        `Timed out after ${connectTimeoutMs}ms waiting for gradle-server to connect to task pipe`
                    );
                    reportPipeFailure("taskPipeConnectTimeout", err.message);
                    reject(err);
                }, connectTimeoutMs);
            }
            pendingWaiters.push(waiter);
        });
    };

    server.on("connection", (socket) => {
        if (disposed) {
            socket.destroy();
            return;
        }

        if (activeSocket && !activeSocket.destroyed) {
            activeSocket.destroy();
        }
        activeSocket = socket;

        const reader = new SocketMessageReader(socket);
        const writer = new SocketMessageWriter(socket);

        socket.on("error", (socketErr) => {
            options.logger?.error(`gradle-server task pipe error: ${socketErr.message}`);
            reportPipeFailure("taskPipeConnectionClosed", socketErr.message);
        });
        socket.on("close", (hadError) => {
            if (activeSocket === socket) {
                activeSocket = undefined;
            }
            options.logger?.info(`gradle-server task pipe closed${hadError ? " after error" : ""}`);
        });

        const conn = createMessageConnection(reader, writer, options.logger);
        const waiter = pendingWaiters.shift();
        if (waiter) {
            if (waiter.timeoutHandle) {
                clearTimeout(waiter.timeoutHandle);
            }
            waiter.resolve(conn);
        } else {
            pendingConnections.push(conn);
        }
        onConnectionEmitter.fire(conn);
    });

    server.on("error", (err) => {
        reportPipeFailure("taskPipeSetupFailure", err.message);
        rejectPendingWaiters(err);
    });

    return {
        pipePath,
        get connection() {
            return waitForConnection(timeoutMs);
        },
        onConnection: onConnectionEmitter.event,
        waitForConnection,
        dispose: () => {
            if (disposed) {
                return;
            }
            disposed = true;
            rejectPendingWaiters(new Error("Task pipe listener disposed before gradle-server connected"));
            for (const connection of pendingConnections.splice(0)) {
                connection.dispose();
            }
            closeServer(server, pipePath);
            if (activeSocket && !activeSocket.destroyed) {
                activeSocket.destroy();
            }
            onConnectionEmitter.dispose();
        },
    };

    function rejectPendingWaiters(err: Error): void {
        for (const waiter of pendingWaiters.splice(0)) {
            if (waiter.timeoutHandle) {
                clearTimeout(waiter.timeoutHandle);
            }
            waiter.reject(err);
        }
    }
}

function closeServer(server: net.Server, pipePath: string): void {
    try {
        server.close();
    } catch {
        // best-effort; cleanup below still removes the Unix socket path
    }
    cleanupPipePath(pipePath);
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
