import { GradleExecution } from "./GradleExecution";
import { execAsync } from "../../../util/execAsync";
import { getConfigJavaImportGradleJavaHome } from "../../../util/config";
import { logger } from "../../../logger";
import * as path from "path";

export class GradleLocalInstallation implements GradleExecution {
    private gradleExecPath: string;

    constructor(gradleHomePath: string) {
        const exeName = process.platform === "win32" ? "gradle.bat" : "gradle";
        // Resolve the executable inside the Gradle home "bin" directory.
        this.gradleExecPath = `"${path.join(gradleHomePath, "bin", exeName)}"`;
    }

    public async exec(args: string[]): Promise<string> {
        if (args.length === 0) {
            throw new Error("No gradle args supplied");
        }

        const quotedArgs = args.map((arg) => `"${arg}"`).join(" ");
        const command = `${this.gradleExecPath} ${quotedArgs}`;

        try {
            const jdkPath = getConfigJavaImportGradleJavaHome();
            const env = jdkPath ? { ...process.env, JAVA_HOME: jdkPath } : process.env;

            const { stdout, stderr } = await execAsync(command, { env });
            if (stderr) {
                logger.error(stderr);
            }
            return stdout;
        } catch (error) {
            logger.error(error.message);
            throw new Error(`Error running gradle local installation: ${error.message}`);
        }
    }
}
