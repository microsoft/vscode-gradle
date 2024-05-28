import { GradleExecution } from "./GradleExecution";
import { execAsync } from "../../../util/execAsync";
import { getConfigJavaImportGradleJavaHome } from "../../../util/config";
import * as vscode from "vscode";

export class GradleLocalInstallation implements GradleExecution {
    private gradleHomePath: string;
    private outputChannel: vscode.OutputChannel;
    constructor(gradleHomePath: string) {
        this.gradleHomePath = gradleHomePath;
    }

    public async exec(args: string[]): Promise<string> {
        if (args.length === 0) {
            throw new Error("No gradle args supplied");
        }

        const command = `${this.gradleHomePath} ${args.join(" ")}`;

        try {
            const jdkPath = getConfigJavaImportGradleJavaHome();
            const env = jdkPath ? { ...process.env, JAVA_HOME: jdkPath } : process.env;

            const { stdout, stderr } = await execAsync(command, { env });
            if (stderr) {
                this.outputChannel.appendLine(`${stderr}`);
                this.outputChannel.show();
            }
            return stdout;
        } catch (error) {
            throw new Error(`Error running gradle local installation: ${error.message}`);
        }
    }
}
