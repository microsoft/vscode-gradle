import * as net from "net";
import * as rpc from "vscode-jsonrpc/node";
import * as vscode from "vscode";
import * as path from "path";

export const GET_IMPORTER_PIPE_NAME = "gradle.getImporterPipeName";

/**
 * This class will receive the pipe name from Java jdt.ls importer,
 * generate named pipe file and setting up a pipe server that will be used to
 * communicate with the importer
 */
export class JdtlsImporterConnector {
    private importerConnection: rpc.MessageConnection | null = null;
    private importerPipeServer: net.Server;
    private importerPipePath: string;
    private readonly context: vscode.ExtensionContext;
    private readonly _onPipePathReady: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.registerCommand();
    }

    //Receive the pipe name from Java jdt.ls importer
    public async waitForImporterPipePath(): Promise<void> {
        return new Promise((resolve) => {
            this._onPipePathReady.event((resolvedPath) => {
                this.importerPipePath = resolvedPath;
                resolve();
            });
        });
    }

    private registerCommand(): void {
        this.context.subscriptions.push(
            vscode.commands.registerCommand(GET_IMPORTER_PIPE_NAME, (pipeName: string) => {
                this._onPipePathReady.fire(path.resolve(pipeName));
            })
        );
    }

    public async setupImporterServer(): Promise<void> {
        return new Promise((resolve) => {
            this.importerPipeServer = net.createServer((socket: net.Socket) => {
                this.importerConnection = rpc.createMessageConnection(
                    new rpc.StreamMessageReader(socket),
                    new rpc.StreamMessageWriter(socket)
                );
                resolve();
            });
            this.importerPipeServer.listen(this.importerPipePath);
        });
    }

    public startListening(): void {
        this.importerConnection!.listen();
    }

    public getImporterConnection(): rpc.MessageConnection | null {
        return this.importerConnection;
    }
}
