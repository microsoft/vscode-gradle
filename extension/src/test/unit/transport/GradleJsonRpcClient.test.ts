import * as assert from "assert";
import { PassThrough } from "stream";
import {
    createMessageConnection,
    MessageConnection,
    NotificationType,
    RequestType,
    ResponseError,
    StreamMessageReader,
    StreamMessageWriter,
} from "vscode-jsonrpc/node";
import {
    CancelBuildReply,
    CancelBuildRequest,
    CancelBuildsReply,
    CancelBuildsRequest,
    ExecuteCommandReply,
    ExecuteCommandRequest,
    GetBuildReply,
    GetBuildRequest,
    GetBuildResult,
    GetProjectDependenciesReply,
    GetProjectDependenciesRequest,
    GradleBuild,
    GradleProject,
    Progress,
    RunBuildReply,
    RunBuildRequest,
    RunBuildResult,
} from "../../../proto/gradle_pb";
import { decodeProto, encodeProto, GradleJsonRpcClient, JsonRpcErrors } from "../../../transport/jsonrpc";
import { GradleRequestParams, GradleResponse, GradleStreamPayload } from "../../../transport/jsonrpc/types";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

const GET_BUILD = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/getBuild");
const RUN_BUILD = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/runBuild");
const GET_PROJECT_DEPENDENCIES = new RequestType<GradleRequestParams, GradleResponse, void>(
    "gradle/getProjectDependencies"
);
const CANCEL_BUILD = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/cancelBuild");
const CANCEL_BUILDS = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/cancelBuilds");
const EXECUTE_COMMAND = new RequestType<GradleRequestParams, GradleResponse, void>("gradle/executeCommand");
const GET_BUILD_REPLY_NOTIF = new NotificationType<GradleStreamPayload>("gradle/getBuild/reply");
const RUN_BUILD_REPLY_NOTIF = new NotificationType<GradleStreamPayload>("gradle/runBuild/reply");

/**
 * Wire two `MessageConnection`s back-to-back over `PassThrough` streams,
 * mirroring `JsonRpcTransportTest` on the Java side. The "server" side is
 * a vanilla `MessageConnection` we can register handlers on; the "client"
 * side is wrapped in `GradleJsonRpcClient`, which is what production code
 * uses against the JVM.
 */
function wirePair(): {
    client: MessageConnection;
    server: MessageConnection;
    killTransport: () => void;
    dispose: () => void;
} {
    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();

    const client = createMessageConnection(
        new StreamMessageReader(serverToClient),
        new StreamMessageWriter(clientToServer)
    );
    const server = createMessageConnection(
        new StreamMessageReader(clientToServer),
        new StreamMessageWriter(serverToClient)
    );

    server.listen();

    return {
        client,
        server,
        // Simulate the gradle-server socket dying without first disposing the
        // client connection — destroying the stream the client reads from makes
        // its reader see EOF, which is what fires the connection's onClose.
        killTransport: () => {
            serverToClient.destroy();
            clientToServer.destroy();
        },
        dispose: () => {
            try {
                client.dispose();
            } catch {
                /* ignore */
            }
            try {
                server.dispose();
            } catch {
                /* ignore */
            }
            clientToServer.destroy();
            serverToClient.destroy();
        },
    };
}

describe(suiteName("GradleJsonRpcClient transport"), () => {
    it("encodes and decodes proto bytes through base64", () => {
        const original = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x7f]);
        const encoded = encodeProto(original);
        assert.strictEqual(typeof encoded, "string");
        const decoded = decodeProto(encoded);
        assert.deepStrictEqual(Array.from(decoded), Array.from(original));
    });

    describe("end-to-end JSON-RPC roundtrips", () => {
        let wired: ReturnType<typeof wirePair>;
        let client: GradleJsonRpcClient;

        beforeEach(() => {
            wired = wirePair();
            client = new GradleJsonRpcClient(wired.client);
        });

        afterEach(() => {
            client.dispose();
            wired.dispose();
        });

        it("returns the terminal GetBuildReply carrying the build result", async () => {
            // Regression: the Java handler delivers the GET_BUILD_RESULT as the
            // JSON-RPC response body (not as a stream notification). The TS
            // facade must surface that terminal reply so callers can read the
            // resulting GradleBuild.
            wired.server.onRequest(GET_BUILD, (params) => {
                const terminal = new GetBuildReply();
                const result = new GetBuildResult();
                const build = new GradleBuild();
                const project = new GradleProject();
                project.setProjectpath(":root");
                build.setProject(project);
                result.setBuild(build);
                terminal.setGetBuildResult(result);
                return { reply: encodeProto(terminal.serializeBinary()), streamId: params.streamId };
            });

            const request = new GetBuildRequest();
            request.setProjectDir("/tmp/example");
            const notifications: GetBuildReply[] = [];
            const terminalReply = await client.getBuild(request, (r) => notifications.push(r));

            assert.deepStrictEqual(notifications, []);
            assert.ok(terminalReply, "terminal reply must be returned to caller");
            assert.strictEqual(terminalReply!.getKindCase(), GetBuildReply.KindCase.GET_BUILD_RESULT);
            assert.strictEqual(terminalReply!.getGetBuildResult()!.getBuild()!.getProject()!.getProjectpath(), ":root");
        });

        it("dispatches getBuild stream notifications and terminates with a null response", async () => {
            wired.server.onRequest(GET_BUILD, (params) => {
                assert.ok(params.streamId !== null, "streamId must be allocated for streaming RPCs");
                const requestBytes = decodeProto(params.request!);
                const decoded = GetBuildRequest.deserializeBinary(requestBytes);
                assert.strictEqual(decoded.getProjectDir(), "/tmp/example");

                // Emit two progress notifications on the streaming channel.
                const reply1 = new GetBuildReply();
                const progress1 = new Progress();
                progress1.setMessage("Configuring");
                reply1.setProgress(progress1);
                wired.server.sendNotification(GET_BUILD_REPLY_NOTIF, {
                    streamId: params.streamId!,
                    payload: encodeProto(reply1.serializeBinary()),
                });

                const reply2 = new GetBuildReply();
                const progress2 = new Progress();
                progress2.setMessage("Resolving dependencies");
                reply2.setProgress(progress2);
                wired.server.sendNotification(GET_BUILD_REPLY_NOTIF, {
                    streamId: params.streamId!,
                    payload: encodeProto(reply2.serializeBinary()),
                });

                // Streaming RPCs terminate with `reply: null` on the response.
                return { reply: null };
            });

            const request = new GetBuildRequest();
            request.setProjectDir("/tmp/example");

            const seen: string[] = [];
            const terminal = await client.getBuild(request, (reply) => {
                if (reply.hasProgress()) {
                    seen.push(reply.getProgress()!.getMessage());
                }
            });

            assert.strictEqual(terminal, null, "streaming getBuild resolves with null on terminal response");
            assert.deepStrictEqual(seen, ["Configuring", "Resolving dependencies"]);
        });

        it("multiplexes concurrent streaming calls by streamId", async () => {
            const seenStreamIds = new Set<number>();
            wired.server.onRequest(GET_BUILD, (params) => {
                seenStreamIds.add(params.streamId!);
                const reply = new GetBuildReply();
                const progress = new Progress();
                progress.setMessage(`stream-${params.streamId}`);
                reply.setProgress(progress);
                wired.server.sendNotification(GET_BUILD_REPLY_NOTIF, {
                    streamId: params.streamId!,
                    payload: encodeProto(reply.serializeBinary()),
                });
                return { reply: null };
            });

            const req = new GetBuildRequest();
            req.setProjectDir("/tmp/a");
            const messagesA: string[] = [];
            const messagesB: string[] = [];

            await Promise.all([
                client.getBuild(req, (r) => messagesA.push(r.getProgress()!.getMessage())),
                client.getBuild(req, (r) => messagesB.push(r.getProgress()!.getMessage())),
            ]);

            assert.strictEqual(seenStreamIds.size, 2, "two distinct streamIds must be allocated");
            assert.strictEqual(messagesA.length, 1);
            assert.strictEqual(messagesB.length, 1);
            assert.notStrictEqual(messagesA[0], messagesB[0], "callbacks must not be cross-pollinated");
        });

        it("returns the decoded reply for runBuild streaming RPCs", async () => {
            wired.server.onRequest(RUN_BUILD, (params) => {
                const decoded = RunBuildRequest.deserializeBinary(decodeProto(params.request!));
                assert.deepStrictEqual(decoded.getArgsList(), ["build", "--info"]);

                const intermediate = new RunBuildReply();
                const progress = new Progress();
                progress.setMessage("Running");
                intermediate.setProgress(progress);
                wired.server.sendNotification(RUN_BUILD_REPLY_NOTIF, {
                    streamId: params.streamId!,
                    payload: encodeProto(intermediate.serializeBinary()),
                });
                const terminal = new RunBuildReply();
                const result = new RunBuildResult();
                result.setMessage("Successfully run build");
                terminal.setRunBuildResult(result);
                return { reply: encodeProto(terminal.serializeBinary()) };
            });

            const request = new RunBuildRequest();
            request.setProjectDir("/tmp/example");
            request.setArgsList(["build", "--info"]);

            const seen: string[] = [];
            const terminalReply = await client.runBuild(request, (reply) => {
                if (reply.hasProgress()) {
                    seen.push(reply.getProgress()!.getMessage());
                }
            });
            assert.deepStrictEqual(seen, ["Running"]);
            assert.ok(terminalReply, "runBuild must surface the terminal reply");
            assert.strictEqual(terminalReply!.getKindCase(), RunBuildReply.KindCase.RUN_BUILD_RESULT);
            assert.strictEqual(terminalReply!.getRunBuildResult()!.getMessage(), "Successfully run build");
        });

        it("roundtrips unary getProjectDependencies with a non-null reply", async () => {
            wired.server.onRequest(GET_PROJECT_DEPENDENCIES, (params) => {
                const decoded = GetProjectDependenciesRequest.deserializeBinary(decodeProto(params.request!));
                assert.strictEqual(decoded.getProjectPath(), ":app");
                const reply = new GetProjectDependenciesReply();
                return { reply: encodeProto(reply.serializeBinary()) };
            });

            const request = new GetProjectDependenciesRequest();
            request.setProjectPath(":app");
            const reply = await client.getProjectDependencies(request);
            assert.ok(reply instanceof GetProjectDependenciesReply);
        });

        it("roundtrips cancelBuild + cancelBuilds + executeCommand", async () => {
            wired.server.onRequest(CANCEL_BUILD, () => {
                const reply = new CancelBuildReply();
                reply.setMessage("cancelled");
                reply.setBuildRunning(false);
                return { reply: encodeProto(reply.serializeBinary()) };
            });
            wired.server.onRequest(CANCEL_BUILDS, () => {
                const reply = new CancelBuildsReply();
                reply.setMessage("all cancelled");
                return { reply: encodeProto(reply.serializeBinary()) };
            });
            wired.server.onRequest(EXECUTE_COMMAND, () => {
                const reply = new ExecuteCommandReply();
                reply.setResult("normalized");
                return { reply: encodeProto(reply.serializeBinary()) };
            });

            const cancelBuildRequest = new CancelBuildRequest();
            cancelBuildRequest.setCancellationKey("key-1");
            const cancelBuildReply = await client.cancelBuild(cancelBuildRequest);
            assert.strictEqual(cancelBuildReply?.getMessage(), "cancelled");
            assert.strictEqual(cancelBuildReply?.getBuildRunning(), false);

            const cancelBuildsReply = await client.cancelBuilds(new CancelBuildsRequest());
            assert.strictEqual(cancelBuildsReply?.getMessage(), "all cancelled");

            const executeReply = await client.executeCommand(new ExecuteCommandRequest());
            assert.strictEqual(executeReply?.getResult(), "normalized");
        });

        it("translates ResponseError codes back into GradleRpcError", async () => {
            wired.server.onRequest(GET_PROJECT_DEPENDENCIES, () => {
                throw new ResponseError(JsonRpcErrors.NOT_FOUND, "no project", "subprojects:foo");
            });
            wired.server.onRequest(CANCEL_BUILD, () => {
                throw new ResponseError(JsonRpcErrors.CANCELLED, "cancelled");
            });
            wired.server.onRequest(EXECUTE_COMMAND, () => {
                throw new ResponseError(JsonRpcErrors.INTERNAL, "boom");
            });

            await assert.rejects(
                client.getProjectDependencies(new GetProjectDependenciesRequest()),
                (err: Error & { code?: number; details?: string }) => {
                    assert.strictEqual(err.code, JsonRpcErrors.NOT_FOUND);
                    assert.strictEqual(err.message, "no project");
                    assert.strictEqual(err.details, "subprojects:foo");
                    return true;
                }
            );
            await assert.rejects(client.cancelBuild(new CancelBuildRequest()), (err: Error & { code?: number }) => {
                assert.strictEqual(err.code, JsonRpcErrors.CANCELLED);
                return true;
            });
            await assert.rejects(
                client.executeCommand(new ExecuteCommandRequest()),
                (err: Error & { code?: number }) => {
                    assert.strictEqual(err.code, JsonRpcErrors.INTERNAL);
                    return true;
                }
            );
        });

        it("fires onClosed and rejects further requests when the connection dies", async () => {
            const closedErrors: Array<Error | undefined> = [];
            const closed = new Promise<void>((resolve) =>
                client.onClosed((err) => {
                    closedErrors.push(err);
                    resolve();
                })
            );

            // Kill the transport (gradle-server socket death) while the client
            // connection is still listening, so its reader sees EOF.
            wired.killTransport();
            await closed;

            assert.strictEqual(closedErrors.length, 1, "onClosed must fire exactly once");

            // After death, a request must surface as a handled GradleRpcError
            // rather than an unhandled "write after destroyed" rejection.
            await assert.rejects(
                client.getProjectDependencies(new GetProjectDependenciesRequest()),
                (err: Error & { code?: number }) => {
                    assert.strictEqual(err.code, JsonRpcErrors.UNKNOWN);
                    return true;
                }
            );
        });

        it("rejects an in-flight streaming request when the transport dies mid-build", async () => {
            // The server never answers, so the runBuild request is still in flight
            // when the gradle-server socket dies underneath it.
            const inFlight = client.runBuild(new RunBuildRequest(), () => {
                /* no stream replies expected */
            });
            // Let the request reach the wire, then sever the transport.
            await new Promise((resolve) => setImmediate(resolve));
            wired.killTransport();

            // The pending call must settle as a handled rejection rather than
            // hanging forever or leaking an unhandled write-after-destroy error.
            await assert.rejects(inFlight);
        });
    });
});
