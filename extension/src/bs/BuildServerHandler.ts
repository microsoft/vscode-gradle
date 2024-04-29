import * as net from "net";
import * as rpc from "vscode-jsonrpc/node";
import * as vscode from "vscode";
import * as fs from "fs";
import { generateRandomPipeName } from "../util/generateRandomPipeName";

export class BuildServerHandler implements vscode.Disposable {
    private buildServerConnection: rpc.MessageConnection | null = null;
    private buildServerPipeServer: net.Server;
    private serverPipePath: string;

    public async setupBuildServerHandler(): Promise<void> {
        this.serverPipePath = await generateRandomPipeName("server");
        this.buildServerPipeServer = net.createServer((socket: net.Socket) => {
            this.buildServerConnection = rpc.createMessageConnection(
                new rpc.StreamMessageReader(socket),
                new rpc.StreamMessageWriter(socket)
            );
            this.buildServerConnection.listen();
        });
        this.buildServerPipeServer.listen(this.serverPipePath);
    }

    public getBuildServerPipeName(): string {
        return this.serverPipePath;
    }
    public getBuildServerConnection(): rpc.MessageConnection | null {
        return this.buildServerConnection;
    }
    public dispose(): void {
        if (fs.existsSync(this.serverPipePath)) {
            fs.unlinkSync(this.serverPipePath);
        }
    }
}
