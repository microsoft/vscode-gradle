import * as net from 'net';
import * as rpc from 'vscode-jsonrpc/node';
import { Logger } from "../logger/index";
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';

export const GET_IMPORTER_PIPE_NAME = "gradle.getImporterPipeName";

export class ImporterHandler implements vscode.Disposable {
    public importerConnection: rpc.MessageConnection | null = null;
    private importerPipeServer: net.Server;
    private importerPipePath: string;
    constructor(private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger) {}

    public async waitForImporterPipePath(): Promise<void> {
        return new Promise((resolve) => {
            this.context.subscriptions.push(
                vscode.commands.registerCommand(GET_IMPORTER_PIPE_NAME, (pipeName: string) => {
                    this.importerPipePath = path.resolve(pipeName);
                    this.logger.info("Received Importer PipeName from Java: ", this.importerPipePath);
                    resolve();
                })
            );
        });
    }

    public setupImporterHandler(buildServerConnection: rpc.MessageConnection): void {
        this.importerPipeServer = net.createServer((socket: net.Socket) => {
            this.importerConnection = rpc.createMessageConnection(
                new rpc.StreamMessageReader(socket),
                new rpc.StreamMessageWriter(socket)
            );
            if (!this.importerConnection) {
                this.logger.error("Importer Connection is Null");
                return;
            }
            if (!buildServerConnection) {
                this.logger.error("Build Server Connection is Null");
                return;
            }

            this.importerConnection.onRequest((method, params) => {
                this.logger.info("importerConnection.onRequest: ", method);
                return buildServerConnection.sendRequest(method, params);
            });
            buildServerConnection.onNotification((method, params) => {
                this.logger.info("buildServerConnection.onNotification: ", method);
                this.importerConnection!.sendNotification(method, params);
            });

            this.importerConnection.listen();
        });

        this.importerPipeServer.listen(this.importerPipePath, () => {
            this.logger.info("！Importer Pipe Server is listening on: ", this.importerPipePath);
        });
    }

    public dispose(): void {
        if (fs.existsSync(this.importerPipePath)) {
            fs.unlinkSync(this.importerPipePath);
        }
    }
}
