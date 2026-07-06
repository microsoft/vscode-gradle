/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from "assert";
import { PassThrough } from "stream";
import {
    createMessageConnection,
    MessageConnection,
    StreamMessageReader,
    StreamMessageWriter,
} from "vscode-jsonrpc/node";
import { forwardBspMessages } from "../../../bs/BspProxy";
import { Logger } from "../../../logger";
import { buildMockOutputChannel } from "../../testUtil";

function suiteName(name: string): string {
    const prefix = process.env.SUITE_NAME ? `${process.env.SUITE_NAME} - ` : "";
    return `${prefix}${name}`;
}

/**
 * Wire two `MessageConnection`s back-to-back over in-memory `PassThrough`
 * streams so both endpoints are live and can exchange real JSON-RPC traffic.
 */
function connectionPair(): { a: MessageConnection; b: MessageConnection; dispose: () => void } {
    const aToB = new PassThrough();
    const bToA = new PassThrough();
    const a = createMessageConnection(new StreamMessageReader(bToA), new StreamMessageWriter(aToB));
    const b = createMessageConnection(new StreamMessageReader(aToB), new StreamMessageWriter(bToA));
    return {
        a,
        b,
        dispose: (): void => {
            try {
                a.dispose();
            } catch {
                /* ignore */
            }
            try {
                b.dispose();
            } catch {
                /* ignore */
            }
            aToB.destroy();
            bToA.destroy();
        },
    };
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!predicate()) {
        throw new Error("condition was not met within the timeout");
    }
}

describe(suiteName("BspProxy message forwarding"), () => {
    // The proxy sits between the JDT LS importer and the build server, each of
    // which connects over its own named pipe. Model that with two connection
    // pairs: the importer client <-> the proxy's importer-side connection, and
    // the proxy's build-server-side connection <-> the build server.
    let importerPair: ReturnType<typeof connectionPair>;
    let buildServerPair: ReturnType<typeof connectionPair>;
    let logger: Logger;

    beforeEach(() => {
        importerPair = connectionPair();
        buildServerPair = connectionPair();
        logger = new Logger();
        logger.setLoggingChannel(buildMockOutputChannel());
    });

    afterEach(() => {
        importerPair.dispose();
        buildServerPair.dispose();
    });

    function startForwarding(): {
        importerClient: MessageConnection;
        buildServer: MessageConnection;
    } {
        const importerClient = importerPair.a;
        const importerConnection = importerPair.b;
        const buildServerConnection = buildServerPair.a;
        const buildServer = buildServerPair.b;

        forwardBspMessages(importerConnection, buildServerConnection, logger);

        importerClient.listen();
        importerConnection.listen();
        buildServerConnection.listen();
        buildServer.listen();

        return { importerClient, buildServer };
    }

    it("forwards importer requests to the build server and returns the reply", async () => {
        const { importerClient, buildServer } = startForwarding();

        buildServer.onRequest("build/initialize", (params: any) => {
            return { ok: true, echo: params };
        });

        const reply = await importerClient.sendRequest("build/initialize", { rootUri: "file:///ws" });

        assert.deepStrictEqual(reply, { ok: true, echo: { rootUri: "file:///ws" } });
    });

    it("forwards build server notifications back to the importer", async () => {
        const received: any[] = [];
        const { buildServer } = startForwarding();
        const importerClient = importerPair.a;
        importerClient.onNotification("build/logMessage", (params: any) => {
            received.push(params);
        });

        buildServer.sendNotification("build/logMessage", { message: "compiling" });

        await waitFor(() => received.length === 1);
        assert.deepStrictEqual(received[0], { message: "compiling" });
    });
});
