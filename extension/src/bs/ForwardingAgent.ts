import * as net from 'net';
import { Logger } from "../logger/index";
import * as rpc from 'vscode-jsonrpc/node';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { generateRandomPipeName } from '../util/generateRandomPipeName';
export const GET_IMPORTER_PIPE_NAME = "gradle.getImporterPipeName";

export class ForwardingAgent implements vscode.Disposable {
    private importerHandler: net.Server;
    private buildServerHandler: net.Server;
    private IMPORTER_PIPE_PATH: string = "";
    private SERVER_PIPE_PATH: string = "";
    public importerConnection: rpc.MessageConnection | null = null;
    public buildServerConnection: rpc.MessageConnection | null = null;

    constructor(private readonly context: vscode.ExtensionContext,
        private readonly logger: Logger) {}

        public async start(): Promise<void> {
            this.SERVER_PIPE_PATH = await generateRandomPipeName('server');
            this.setupBuildServerHandler();
            await this.waitForImporterPipePath();
            this.setupImporterHandler();
        }

        private setupBuildServerHandler(): void {
            this.buildServerHandler = net.createServer((socket: net.Socket) => {
                this.buildServerConnection = rpc.createMessageConnection(
                    new rpc.StreamMessageReader(socket),
                    new rpc.StreamMessageWriter(socket)
                );
                this.buildServerConnection.listen();
            });
            this.buildServerHandler.listen(this.SERVER_PIPE_PATH);
        }

        private async waitForImporterPipePath(): Promise<void> {
            return new Promise((resolve) => {
                this.context.subscriptions.push(
                    vscode.commands.registerCommand(GET_IMPORTER_PIPE_NAME, (pipeName: string) => {
                        this.IMPORTER_PIPE_PATH = path.resolve(pipeName);
                        this.logger.info("Received Importer PipeName from Java: ", this.IMPORTER_PIPE_PATH);
                        resolve();
                    })
                );
            });
        }

        private setupImporterHandler(): void {
            this.importerHandler = net.createServer((socket: net.Socket) => {
                this.importerConnection = rpc.createMessageConnection(
                    new rpc.StreamMessageReader(socket),
                    new rpc.StreamMessageWriter(socket)
                );
                this.importerConnection.listen();
                this.forwardMessages();
            });
            this.importerHandler.listen(this.IMPORTER_PIPE_PATH);
            this.logger.info("! Importer Handler is listening on: ", this.IMPORTER_PIPE_PATH);
        }

    private forwardMessages(): void {
        this.importerConnection?.onRequest((method, params) => {
            if (this.buildServerConnection) {
                return this.buildServerConnection.sendRequest(method, params);
            }
            throw new Error('Build server connection is not available.');
        });

        this.importerConnection?.onNotification((method, params) => {
            this.buildServerConnection?.sendNotification(method, params);
        });

        this.buildServerConnection?.onRequest((method, params) => {
            if (this.importerConnection) {
                return this.importerConnection.sendRequest(method, params);
            }
            throw new Error('Build server connection is not available.');
        });

        this.buildServerConnection?.onNotification((method, params) => {
            this.importerConnection?.sendNotification(method, params);
        });
    }

    public getBuildServerPipeName(): string {
        return this.SERVER_PIPE_PATH;
    }

    public dispose(): void {
        try {
            if (fs.existsSync(this.SERVER_PIPE_PATH)) {
                fs.unlinkSync(this.SERVER_PIPE_PATH);
            }
            if (fs.existsSync(this.IMPORTER_PIPE_PATH)) {
                fs.unlinkSync(this.IMPORTER_PIPE_PATH);
            }
        } catch (err) {
            this.logger.error('Error cleaning up pipes:', err);
        }
    }

}
