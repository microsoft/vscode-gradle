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

    constructor(context: vscode.ExtensionContext, private readonly logger: Logger) {
        this.buildServerConnector = new BuildServerConnector();
        this.jdtlsImporterConnector = new JdtlsImporterConnector(context);
    }
    /**
     * This function needs to be called before we start Java Gradle Server.
     */
    public prepareToStart(): void {
        this.buildServerConnector.setupBuildServerPipeStream();
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

        this.setupMessageForwarding(
            this.jdtlsImporterConnector.getImporterConnection(),
            this.buildServerConnector.getServerConnection()
        );
        this.jdtlsImporterConnector.startListening();
    }

    public getBuildServerPipeName(): string {
        return this.buildServerConnector.getServerPipePath();
    }

    private setupMessageForwarding(
        importerConnection: rpc.MessageConnection | null,
        buildServerConnection: rpc.MessageConnection | null
    ): void {
        importerConnection?.onRequest((method, params) => {
            if (params !== null) {
                return buildServerConnection?.sendRequest(method, params);
            }
            return buildServerConnection?.sendRequest(method);
        });

        buildServerConnection?.onNotification((method, params) => {
            if (params !== null) {
                return importerConnection?.sendNotification(method, params);
            }
            importerConnection?.sendNotification(method);
        });
        importerConnection?.onError(([error]) => {
            this.logger.error(`Error on importerConnection: ${error.message}`);
            sendInfo("", {
                kind: "bspProxy-importerConnectionError",
                message: error.message,
                proxyErrorStack: error.stack ? error.stack.toString() : "",
            });
            // TODO: Implement more specific error handling logic here
        });

        buildServerConnection?.onError(([error]) => {
            this.logger.error(`Error on buildServerConnection: ${error.message}`);
            sendInfo("", {
                kind: "bspProxy-buildServerConnectionError",
                message: error.message,
                proxyErrorStack: error.stack ? error.stack.toString() : "",
            });
            // TODO: Implement more specific error handling logic here
        });
    }

    public closeConnection(): void {
        this.buildServerConnector.close();
        this.jdtlsImporterConnector.close();
        this.logger.info("Build Server connection closed");
    }
}
