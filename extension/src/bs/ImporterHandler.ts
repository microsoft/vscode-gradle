import * as net from "net";
import * as rpc from "vscode-jsonrpc/node";
import * as vscode from "vscode";
import * as path from "path";

export const GET_IMPORTER_PIPE_NAME = "gradle.getImporterPipeName";

export class ImporterHandler {
    public importerConnection: rpc.MessageConnection | null = null;
    private importerPipeServer: net.Server;
    private importerPipePath: string;
    constructor(private readonly context: vscode.ExtensionContext) {}

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

    public setupImporterHandler(buildServerConnection: rpc.MessageConnection | null): void {
        this.importerPipeServer = net.createServer((socket: net.Socket) => {
            this.importerConnection = rpc.createMessageConnection(
                new rpc.StreamMessageReader(socket),
                new rpc.StreamMessageWriter(socket)
            );
            this.importerConnection?.onRequest((method, params) => {
                return buildServerConnection?.sendRequest(method, params);
            });
            buildServerConnection?.onNotification((method, params) => {
                this.importerConnection?.sendNotification(method, params);
            });

            this.importerConnection.listen();
        });
        this.importerPipeServer.listen(this.importerPipePath);
    }
}
