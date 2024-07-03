import * as net from "net";
import * as rpc from "vscode-jsonrpc/node";
import * as vscode from "vscode";
import * as path from "path";

export const GET_IMPORTER_PIPE_NAME = "gradle.getImporterPipeName";

export class JdtlsImporterConnector {
    private importerConnection: rpc.MessageConnection | null = null;
    private importerPipeServer: net.Server;
    private importerPipePath: string;
    private readonly context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    //receive the pipe name from Java jdt.ls importer
    public async waitForImporterPipePath(): Promise<void> {
        return new Promise((resolve) => {
            this.context.subscriptions.push(
                vscode.commands.registerCommand(GET_IMPORTER_PIPE_NAME, (pipeName: string) => {
                    this.importerPipePath = path.resolve(pipeName);
                    resolve();
                })
            );
        });
    }

    public setupImporterServer(buildServerConnection: rpc.MessageConnection | null): void {
        this.importerPipeServer = net.createServer((socket: net.Socket) => {
            this.importerConnection = rpc.createMessageConnection(
                new rpc.StreamMessageReader(socket),
                new rpc.StreamMessageWriter(socket)
            );
            this.setupMessageForwarding(buildServerConnection);
            this.importerConnection.listen();
        });
        this.importerPipeServer.listen(this.importerPipePath);
    }

    private setupMessageForwarding(buildServerConnection: rpc.MessageConnection | null): void {
        const importerConnection = this.importerConnection;

        importerConnection?.onRequest((method, params) => {
            return buildServerConnection?.sendRequest(method, params);
        });
        buildServerConnection?.onNotification((method, params) => {
            importerConnection?.sendNotification(method, params);
        });
    }
}
