import * as net from "net";
import * as rpc from "vscode-jsonrpc/node";
import { generateRandomPipeName } from "../util/generateRandomPipeName";

export class BuildServerHandler {
    private buildServerConnection: rpc.MessageConnection | null = null;
    private buildServerPipeServer: net.Server;
    private serverPipePath: string;

    public setupBuildServerHandler(): void {
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

    public getBuildServerPipeName(): string {
        return this.serverPipePath;
    }
    public getBuildServerConnection(): rpc.MessageConnection | null {
        return this.buildServerConnection;
    }
}
