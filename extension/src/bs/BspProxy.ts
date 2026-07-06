import { JdtlsImporterConnector } from "./JdtlsImporterConnector";
import { BuildServerConnector } from "./BuildServerConnector";
import * as vscode from "vscode";
import * as rpc from "vscode-jsonrpc/node";
import { Logger } from "../logger/index";
import { sendInfo } from "vscode-extension-telemetry-wrapper";

/**
 * Forwards JSON-RPC messages between the build server and the Java JDT LS importer.
 *
 * This layer is necessary because named pipes are not well supported by Java on Windows,
 * but are well supported by Node.js. So Node.js is used to create two named pipe servers.
 *
 * During the named pipe connecting process, Both the build server and JDT LS importer act as clients connecting to BspProxy.
 */
export class BspProxy {
    private buildServerConnector: BuildServerConnector;
    private jdtlsImporterConnector: JdtlsImporterConnector;
    private buildServerStart: boolean;

    constructor(context: vscode.ExtensionContext, private readonly logger: Logger) {
        this.buildServerConnector = new BuildServerConnector();
        this.jdtlsImporterConnector = new JdtlsImporterConnector(context);
    }
    /**
     * This function needs to be called before we start Java Gradle Server.
     */
    public prepareToStart(): boolean {
        return this.buildServerConnector.setupBuildServerPipeStream();
    }

    /**
     * The order of the following start steps is important.
     *
     * We have to start listening after the message forwarding is setup, otherwise the Java importer
     * will stop polling and start sending messages before the forwarding is setup and the messages will be lost.
     */
    public async start(): Promise<void> {
        await this.jdtlsImporterConnector.waitForImporterPipePath();
        await this.jdtlsImporterConnector.setupImporterPipeStream();
        if (this.buildServerStart) {
            this.setupMessageForwarding(
                this.jdtlsImporterConnector.getImporterConnection(),
                this.buildServerConnector.getServerConnection()
            );
        }
        this.jdtlsImporterConnector.startListening();
    }

    public getBuildServerPipeName(): string {
        return this.buildServerConnector.getServerPipePath();
    }

    private setupMessageForwarding(
        importerConnection: rpc.MessageConnection | null,
        buildServerConnection: rpc.MessageConnection | null
    ): void {
        if (!importerConnection || !buildServerConnection) {
            return;
        }
        forwardBspMessages(importerConnection, buildServerConnection, this.logger);
    }
    public setBuildServerStarted(started: boolean): void {
        this.buildServerStart = started;
    }

    public closeConnection(): void {
        try {
            this.buildServerConnector.close();
            this.jdtlsImporterConnector.close();
        } catch (error) {
            // Error when pipe server not started. Ignore it.
        }
        this.logger.info("Build Server connection closed");
    }
}

/**
 * Wires bidirectional JSON-RPC forwarding between the JDT LS importer connection
 * and the build server connection: importer requests are proxied to the build
 * server (and its reply returned), and build server notifications are proxied
 * back to the importer. Extracted from {@link BspProxy} so the forwarding
 * contract can be unit tested without standing up real named pipes.
 */
export function forwardBspMessages(
    importerConnection: rpc.MessageConnection,
    buildServerConnection: rpc.MessageConnection,
    logger: Logger
): void {
    importerConnection.onRequest((method, params) => {
        // `params` is `undefined` (not `null`) for a no-params request; forwarding
        // it verbatim would serialize `params: [null]` instead of omitting params
        // and change the wire shape, so treat both as "no params".
        if (params !== null && params !== undefined) {
            return buildServerConnection.sendRequest(method, params);
        }
        return buildServerConnection.sendRequest(method);
    });

    buildServerConnection.onNotification((method, params) => {
        if (params !== null && params !== undefined) {
            return importerConnection.sendNotification(method, params);
        }
        importerConnection.sendNotification(method);
    });
    importerConnection.onError(([error]) => {
        logger.error(`Error on importerConnection: ${error.message}`);
        sendInfo("", {
            kind: "bspProxy-importerConnectionError",
            message: error.message,
            proxyErrorStack: error.stack ? error.stack.toString() : "",
        });
    });

    buildServerConnection.onError(([error]) => {
        logger.error(`Error on buildServerConnection: ${error.message}`);
        sendInfo("", {
            kind: "bspProxy-buildServerConnectionError",
            message: error.message,
            proxyErrorStack: error.stack ? error.stack.toString() : "",
        });
    });
}
