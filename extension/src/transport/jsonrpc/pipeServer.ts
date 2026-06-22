// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as net from "net";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { Emitter, Event, Message } from "vscode-jsonrpc";
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

/**
 * A {@link SocketMessageWriter} that never lets a write on an already
 * ended/destroyed socket escape as an unhandled `write after end` rejection.
 *
 * The task transport tears the writable side down (peer reset, JVM exit,
 * `dispose()`) before vscode-jsonrpc observes reader EOF and transitions the
 * connection to Closed. In that window an outbound message would call
 * `socket.write()` on a finished stream, which Node throws synchronously. We
 * guard the writable state up front and route any residual TOCTOU failure
 * through the writer's error event, so callers and in-flight requests settle via
 * the normal connection-close path instead of crashing the extension host.
 *
 * The same tear-down previously crashed the extension host: the synchronous
 * `socket.write()` throw escaped as an unhandled promise rejection and surfaced
 * in telemetry as an `unhandlederror` event rather than a clean socket `error`
 * event, so the disconnect went unrecorded by {@link reportPipeFailure}. We emit
 * `taskPipeWriteAfterEnd` once per writer to keep that signal observable after
 * the crash is suppressed.
 */
export class SafeSocketMessageWriter extends SocketMessageWriter {
    private writeFailureReported = false;

    public constructor(private readonly pipeSocket: net.Socket) {
        super(pipeSocket);
    }

    public async write(msg: Message): Promise<void> {
        if (!this.pipeSocket.writable || this.pipeSocket.writableEnded || this.pipeSocket.destroyed) {
            this.handleWriteFailure(new Error("gradle-server task pipe is no longer writable"), msg);
            return;
        }
        try {
            await super.write(msg);
        } catch (err) {
            this.handleWriteFailure(err instanceof Error ? err : new Error(String(err)), msg);
        }
    }

    private handleWriteFailure(error: Error, msg: Message): void {
        this.fireError(error, msg);
        if (!this.writeFailureReported) {
            this.writeFailureReported = true;
            reportPipeFailure("taskPipeWriteAfterEnd", error.message);
        }
    }
}

export interface PipeListener {
    /** Pipe path the JVM should be told to connect back to. */
    readonly pipePath: string;
    /**
     * Convenience accessor that waits for the next `MessageConnection` using the
     * default timeout. Each read registers a fresh waiter, so production code
     * should prefer {@link waitForConnection}; this is kept for tests and simple
     * call sites.
     */
    readonly connection: Promise<MessageConnection>;
    /**
     * Fires every time the JVM establishes a new task transport session.
     * Currently consumed only by tests; exposed for future subscribers that need
     * to observe every session without consuming the {@link waitForConnection}
     * queue.
     */
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
    let disposedReason: Error | undefined;
    let hasAcceptedConnection = false;
    // Sockets we intentionally tear down to accept a fresh reconnect; tracked so
    // their close is classified as an expected handover rather than a drop.
    const supersededSockets = new WeakSet<net.Socket>();
    const pendingConnections: MessageConnection[] = [];
    const pendingWaiters: Array<{
        resolve: (connection: MessageConnection) => void;
        reject: (reason: Error) => void;
        timeoutHandle?: NodeJS.Timeout;
    }> = [];
    const onConnectionEmitter = new Emitter<MessageConnection>();

    const waitForConnection = (connectTimeoutMs = timeoutMs): Promise<MessageConnection> => {
        if (disposed) {
            return Promise.reject(
                disposedReason ?? new Error("Task pipe listener disposed before gradle-server connected")
            );
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
        hasAcceptedConnection = true;

        if (activeSocket && !activeSocket.destroyed) {
            supersededSockets.add(activeSocket);
            activeSocket.destroy();
        }
        activeSocket = socket;

        const reader = new SocketMessageReader(socket);
        const writer = new SafeSocketMessageWriter(socket);
        const connectedAt = Date.now();
        let lastSocketErrorCode: string | undefined;

        socket.on("error", (socketErr) => {
            // Keep only the low-cardinality, path-free Node error code for telemetry;
            // the full message still goes to the local logger.
            lastSocketErrorCode = (socketErr as NodeJS.ErrnoException).code;
            options.logger?.error(`gradle-server task pipe error: ${socketErr.message}`);
        });
        socket.on("close", (hadError) => {
            if (activeSocket === socket) {
                activeSocket = undefined;
            }
            options.logger?.info(`gradle-server task pipe closed${hadError ? " after error" : ""}`);
            reportPipeDisconnect({
                outcome: classifyDisconnect(disposed, supersededSockets.has(socket), hadError),
                hadError,
                durationMs: Date.now() - connectedAt,
                reason: lastSocketErrorCode,
            });
        });

        const conn = createMessageConnection(reader, writer, options.logger);
        const waiter = pendingWaiters.shift();
        if (waiter) {
            if (waiter.timeoutHandle) {
                clearTimeout(waiter.timeoutHandle);
            }
            waiter.resolve(conn);
        } else {
            replacePendingConnection(conn);
        }
        onConnectionEmitter.fire(conn);
    });

    server.on("error", (err) => {
        reportPipeFailure("taskPipeSetupFailure", err.message);
        teardown(err);
    });

    return {
        pipePath,
        get connection() {
            return waitForConnection(timeoutMs);
        },
        onConnection: onConnectionEmitter.event,
        waitForConnection,
        dispose: () => {
            teardown(
                new Error(
                    hasAcceptedConnection
                        ? "Task pipe listener disposed"
                        : "Task pipe listener disposed before gradle-server connected"
                )
            );
        },
    };

    function teardown(err: Error): void {
        if (disposed) {
            return;
        }
        disposed = true;
        disposedReason = err;
        rejectPendingWaiters(err);
        for (const connection of pendingConnections.splice(0)) {
            connection.dispose();
        }
        closeServer(server, pipePath);
        if (activeSocket && !activeSocket.destroyed) {
            activeSocket.destroy();
        }
        onConnectionEmitter.dispose();
    }

    function rejectPendingWaiters(err: Error): void {
        for (const waiter of pendingWaiters.splice(0)) {
            if (waiter.timeoutHandle) {
                clearTimeout(waiter.timeoutHandle);
            }
            waiter.reject(err);
        }
    }

    function replacePendingConnection(connection: MessageConnection): void {
        for (const pendingConnection of pendingConnections.splice(0)) {
            pendingConnection.dispose();
        }
        pendingConnections.push(connection);
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

/**
 * Classification of how a task pipe socket ended, recorded with every
 * {@link reportPipeDisconnect} so post-release dashboards can separate expected
 * teardown from genuine drops:
 * - `disposed`: the extension tore the listener down (shutdown / reload).
 * - `superseded`: replaced by a fresh JVM reconnect on the same listener.
 * - `error`: the socket closed after an I/O error (ECONNRESET, EPIPE, ...).
 * - `peerClosed`: the JVM closed the stream cleanly (FIN) without an error.
 */
type DisconnectOutcome = "disposed" | "superseded" | "error" | "peerClosed";

function classifyDisconnect(disposed: boolean, superseded: boolean, hadError: boolean): DisconnectOutcome {
    if (disposed) {
        return "disposed";
    }
    if (superseded) {
        return "superseded";
    }
    return hadError ? "error" : "peerClosed";
}

/**
 * Record that a task pipe socket ended. The structured payload is stringified
 * into `dataMsg` because the telemetry sink only persists `kind` and `dataMsg`.
 * `reason` carries the Node error code (e.g. `ECONNRESET`) and never a user path.
 */
function reportPipeDisconnect(detail: {
    outcome: DisconnectOutcome;
    hadError: boolean;
    durationMs: number;
    reason?: string;
}): void {
    sendInfo("", {
        kind: "taskPipeDisconnected",
        dataMsg: JSON.stringify(detail),
        transport: "pipe",
    });
}
