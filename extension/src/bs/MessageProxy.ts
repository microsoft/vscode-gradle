import { JdtlsImporterConnector } from "./JdtlsImporterConnector";
import { BuildServerConnector } from "./BuildServerConnector";
import * as vscode from "vscode";
import * as rpc from "vscode-jsonrpc/node";

export class MessageProxy {
    private buildServerConnector: BuildServerConnector;
    private jdtlsImporterConnector: JdtlsImporterConnector;

    constructor(context: vscode.ExtensionContext) {
        this.buildServerConnector = new BuildServerConnector();
        this.jdtlsImporterConnector = new JdtlsImporterConnector(context);
    }

    public async start(): Promise<void> {
        await this.jdtlsImporterConnector.waitForImporterPipePath();
        await this.jdtlsImporterConnector.setupImporterServer();

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
            return buildServerConnection?.sendRequest(method, params);
        });

        buildServerConnection?.onNotification((method, params) => {
            importerConnection?.sendNotification(method, params);
        });
    }
}
