import * as net from "net";
import * as rpc from "vscode-jsonrpc/node";
import { generateRandomPipeName } from "../util/generateRandomPipeName";

/**
 * This class will create named pipe file and setting up a pipe server
 * that will be used to communicate with the build server
 */
export class BuildServerConnector {
    private serverConnection: rpc.MessageConnection | null = null;
    private serverPipeServer: net.Server;
    private serverPipePath: string;

    constructor() {
        this.setupServer();
    }

    private setupServer(): void {
        this.serverPipePath = generateRandomPipeName();
        this.serverPipeServer = net.createServer((socket: net.Socket) => {
            this.serverConnection = rpc.createMessageConnection(
                new rpc.StreamMessageReader(socket),
                new rpc.StreamMessageWriter(socket)
            );
            this.serverConnection.listen();
        });
        this.serverPipeServer.listen(this.serverPipePath);
    }

    public getServerConnection(): rpc.MessageConnection | null {
        return this.serverConnection;
    }

    public getServerPipePath(): string {
        return this.serverPipePath;
    }
}
