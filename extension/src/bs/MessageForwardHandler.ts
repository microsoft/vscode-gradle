import * as net from "net";
import * as rpc from "vscode-jsonrpc/node";
import * as vscode from "vscode";
import * as path from "path";
import { generateRandomPipeName } from "../util/generateRandomPipeName";

export const GET_IMPORTER_PIPE_NAME = "gradle.getImporterPipeName";

export class MessageForwardHandler {
    private buildServerConnection: rpc.MessageConnection | null = null;
    private importerConnection: rpc.MessageConnection | null = null;
    private buildServerPipeServer: net.Server;
    private importerPipeServer: net.Server;
    private serverPipePath: string;
    private importerPipePath: string;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.setupBuildServerHandler();
    }

    public async startForwarding(): Promise<void> {
        await this.waitForImporterPipePath();
        this.setupImporterHandler();
    }

    private setupBuildServerHandler(): void {
        //TODO: using generateRandomPipeName() from vscode-languageclient after upgrading
        this.serverPipePath = generateRandomPipeName();
        this.buildServerPipeServer = net.createServer((socket: net.Socket) => {
            this.buildServerConnection = rpc.createMessageConnection(
                new rpc.StreamMessageReader(socket),
                new rpc.StreamMessageWriter(socket)
            );
            this.buildServerConnection.listen();
        });
        this.buildServerPipeServer.listen(this.serverPipePath);
    }

    private async waitForImporterPipePath(): Promise<void> {
        return new Promise((resolve) => {
            this.context.subscriptions.push(
                vscode.commands.registerCommand(GET_IMPORTER_PIPE_NAME, (pipeName: string) => {
                    this.importerPipePath = path.resolve(pipeName);
                    resolve();
                })
            );
        });
    }

    private setupImporterHandler(): void {
        this.importerPipeServer = net.createServer((socket: net.Socket) => {
            this.importerConnection = rpc.createMessageConnection(
                new rpc.StreamMessageReader(socket),
                new rpc.StreamMessageWriter(socket)
            );
            this.setupMessageForwarding();
            this.importerConnection.listen();
        });
        this.importerPipeServer.listen(this.importerPipePath);
    }

    private setupMessageForwarding(): void {
        this.importerConnection?.onRequest((method, params) => {
            return this.buildServerConnection?.sendRequest(method, params);
        });

        this.buildServerConnection?.onNotification((method, params) => {
            this.importerConnection?.sendNotification(method, params);
        });
    }

    public getBuildServerPipeName(): string {
        return this.serverPipePath;
    }
}
