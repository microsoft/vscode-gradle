// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Disposable, Emitter, Event, MessageConnection, NotificationType, RequestType } from "vscode-jsonrpc";
import {
    CancelBuildReply,
    CancelBuildRequest,
    CancelBuildsReply,
    CancelBuildsRequest,
    ExecuteCommandReply,
    ExecuteCommandRequest,
    GetBuildReply,
    GetBuildRequest,
    GetProjectDependenciesReply,
    GetProjectDependenciesRequest,
    RunBuildReply,
    RunBuildRequest,
} from "../../proto/gradle_pb";
import { decodeProto, encodeProto } from "./protoCodec";
import { toGradleRpcError } from "./JsonRpcErrors";
import { nextStreamId } from "./streamId";
import { GradleRequestParams, GradleResponse, GradleStreamPayload } from "./types";

/**
 * Typed facade over a `vscode-jsonrpc` `MessageConnection` for the six
 * `gradle/*` methods exposed by `gradle-server`'s `transport.jsonrpc`
 * package.
 *
 * - The unary calls (`getProjectDependencies`, `cancelBuild`,
 *   `cancelBuilds`, `executeCommand`) decode the base64 protobuf reply
 *   from `GradleResponse.reply` and return the parsed `*Reply` message.
 *
 * - The streaming calls (`getBuild`, `runBuild`) allocate a fresh
 *   `streamId`, register a notification listener for that id, send the
 *   request, dispatch each incoming `gradle/*\/reply` notification to the
 *   caller-supplied `onReply` callback, and resolve with the terminal
 *   `*Reply` carried on the JSON-RPC response. The notification
 *   subscription is always cleaned up before the promise settles so a
 *   late notification cannot leak into a different in-flight call.
 *
 * - Errors raised by the server come back as `ResponseError`; we wrap
 *   them in a `GradleRpcError` so call sites that previously typed errors
 *   as the legacy transport's service-error type keep the same
 *   `.code` / `.message` / `.details` access pattern.
 */

const GET_BUILD = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/getBuild");
const RUN_BUILD = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/runBuild");
const GET_PROJECT_DEPENDENCIES = new RequestType<GradleRequestParams, GradleResponse, void>(
    "gradle/getProjectDependencies"
);
const CANCEL_BUILD = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/cancelBuild");
const CANCEL_BUILDS = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/cancelBuilds");
const EXECUTE_COMMAND = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/executeCommand");

const GET_BUILD_REPLY = new NotificationType<GradleStreamPayload>("gradle/getBuild/reply");
const RUN_BUILD_REPLY = new NotificationType<GradleStreamPayload>("gradle/runBuild/reply");

type StreamSink<T> = (reply: T) => void;

export class GradleJsonRpcClient implements Disposable {
    private readonly getBuildSinks = new Map<number, StreamSink<GetBuildReply>>();
    private readonly runBuildSinks = new Map<number, StreamSink<RunBuildReply>>();
    private readonly disposables: Disposable[] = [];
    private readonly _onClosed = new Emitter<Error | undefined>();
    private closed = false;
    private lastError: Error | undefined;

    /**
     * Fires once when the underlying connection dies — either because the
     * `gradle-server` socket closed (process exit / peer reset) or because a
     * transport-level read/write error tore it down. Owners should dispose the
     * client and stop issuing requests in response; further calls reject with a
     * handled {@link GradleRpcError} instead of leaking an unhandled
     * "Cannot call write after a stream was destroyed" rejection.
     */
    public readonly onClosed: Event<Error | undefined> = this._onClosed.event;

    public constructor(private readonly connection: MessageConnection) {
        this.disposables.push(
            this.connection.onNotification(GET_BUILD_REPLY, (params) => {
                const sink = this.getBuildSinks.get(params.streamId);
                if (sink) {
                    sink(GetBuildReply.deserializeBinary(decodeProto(params.payload)));
                }
            })
        );
        this.disposables.push(
            this.connection.onNotification(RUN_BUILD_REPLY, (params) => {
                const sink = this.runBuildSinks.get(params.streamId);
                if (sink) {
                    sink(RunBuildReply.deserializeBinary(decodeProto(params.payload)));
                }
            })
        );

        // The task transport does not heal connection loss the way gRPC did
        // internally, so we must observe it explicitly. `onError` surfaces
        // transport read/write failures (the destroyed-stream write throw is
        // re-fired here); `onClose` fires when the reader/writer sees EOF and
        // vscode-jsonrpc transitions the connection to Closed.
        this.disposables.push(
            this.connection.onError(([error]) => {
                this.lastError = error;
            })
        );
        this.disposables.push(
            this.connection.onClose(() => {
                this.markClosed(this.lastError);
            })
        );

        this.connection.listen();
    }

    public async getBuild(request: GetBuildRequest, onReply: StreamSink<GetBuildReply>): Promise<GetBuildReply | null> {
        return this.runStreamingRequest(
            GET_BUILD,
            request,
            onReply,
            this.getBuildSinks,
            GetBuildReply.deserializeBinary
        );
    }

    public async runBuild(request: RunBuildRequest, onReply: StreamSink<RunBuildReply>): Promise<RunBuildReply | null> {
        return this.runStreamingRequest(
            RUN_BUILD,
            request,
            onReply,
            this.runBuildSinks,
            RunBuildReply.deserializeBinary
        );
    }

    public async getProjectDependencies(
        request: GetProjectDependenciesRequest
    ): Promise<GetProjectDependenciesReply | null> {
        return this.runUnaryRequest(GET_PROJECT_DEPENDENCIES, request, GetProjectDependenciesReply.deserializeBinary);
    }

    public async cancelBuild(request: CancelBuildRequest): Promise<CancelBuildReply | null> {
        return this.runUnaryRequest(CANCEL_BUILD, request, CancelBuildReply.deserializeBinary);
    }

    public async cancelBuilds(request: CancelBuildsRequest): Promise<CancelBuildsReply | null> {
        return this.runUnaryRequest(CANCEL_BUILDS, request, CancelBuildsReply.deserializeBinary);
    }

    public async executeCommand(request: ExecuteCommandRequest): Promise<ExecuteCommandReply | null> {
        return this.runUnaryRequest(EXECUTE_COMMAND, request, ExecuteCommandReply.deserializeBinary);
    }

    public dispose(): void {
        this.closed = true;
        for (const d of this.disposables) {
            try {
                d.dispose();
            } catch {
                // best-effort cleanup
            }
        }
        this.disposables.length = 0;
        this.getBuildSinks.clear();
        this.runBuildSinks.clear();
        try {
            this.connection.end();
        } catch {
            // best-effort
        }
        try {
            this.connection.dispose();
        } catch {
            // best-effort
        }
        this._onClosed.dispose();
    }

    private markClosed(err: Error | undefined): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this._onClosed.fire(err);
    }

    /**
     * Fail fast when the connection is already dead so callers get a handled
     * {@link GradleRpcError} rather than triggering a write on a destroyed
     * socket (which vscode-jsonrpc would surface as an unhandled rejection).
     */
    private ensureOpen(): void {
        if (this.closed) {
            throw toGradleRpcError(new Error("Gradle JSON-RPC connection is closed."));
        }
    }

    private async runUnaryRequest<TRequest extends { serializeBinary(): Uint8Array }, TReply>(
        type: RequestType<GradleRequestParams, GradleResponse, void>,
        request: TRequest,
        deserialize: (bytes: Uint8Array) => TReply
    ): Promise<TReply | null> {
        this.ensureOpen();
        try {
            const response = await this.connection.sendRequest(type, {
                request: encodeProto(request.serializeBinary()),
                streamId: null,
            });
            return decodeReply(response, deserialize);
        } catch (err) {
            throw toGradleRpcError(err);
        }
    }

    private async runStreamingRequest<TRequest extends { serializeBinary(): Uint8Array }, TReply>(
        type: RequestType<GradleRequestParams, GradleResponse, void>,
        request: TRequest,
        onReply: StreamSink<TReply>,
        sinkMap: Map<number, StreamSink<TReply>>,
        deserialize: (bytes: Uint8Array) => TReply
    ): Promise<TReply | null> {
        this.ensureOpen();
        const streamId = nextStreamId();
        sinkMap.set(streamId, onReply);
        try {
            const response = await this.connection.sendRequest(type, {
                request: encodeProto(request.serializeBinary()),
                streamId,
            });
            return decodeReply(response, deserialize);
        } catch (err) {
            throw toGradleRpcError(err);
        } finally {
            sinkMap.delete(streamId);
        }
    }
}

function decodeReply<TReply>(
    response: GradleResponse | undefined,
    deserialize: (bytes: Uint8Array) => TReply
): TReply | null {
    if (!response || response.reply === null || response.reply === undefined) {
        return null;
    }
    return deserialize(decodeProto(response.reply));
}
