import { JdtlsImporterConnector } from "./JdtlsImporterConnector";
import { BuildServerConnector } from "./BuildServerConnector";
import * as vscode from "vscode";

export class MessageProxy {
    private buildServerConnector: BuildServerConnector;
    private jdtlsImporterConnector: JdtlsImporterConnector;

    constructor(context: vscode.ExtensionContext) {
        this.buildServerConnector = new BuildServerConnector();
        this.jdtlsImporterConnector = new JdtlsImporterConnector(context);
    }

    public async start(): Promise<void> {
        await this.jdtlsImporterConnector.waitForImporterPipePath();
        this.jdtlsImporterConnector.setupImporterServer(this.buildServerConnector.getServerConnection());
    }
    public getBuildServerPipeName(): string {
        return this.buildServerConnector.getServerPipePath();
    }
}
