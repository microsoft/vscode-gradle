import * as fse from "fs-extra";
import { execAsync } from "../../../util/execAsync";
import { GradleExecution } from "./GradleExecution";
import * as path from "path";
import { getConfigJavaImportGradleJavaHome } from "../../../util/config";
import { logger } from "../../../logger";

export class GradleWrapper implements GradleExecution {
    private gradleWrapperPath: string;

    constructor(private projectRoot: string) {
        const wrapperName = process.platform === "win32" ? "gradlew.bat" : "gradlew";
        this.gradleWrapperPath = `"${path.join(projectRoot, wrapperName)}"`;
    }

    public async exec(args: string[]): Promise<string> {
        if (args.length === 0) {
            throw new Error("No wrapper args supplied");
        }
        const quotedArgs = args.map((arg) => `"${arg}"`).join(" ");
        const command = `${this.gradleWrapperPath} ${quotedArgs}`;
        try {
            const jdkPath = getConfigJavaImportGradleJavaHome();
            const env = jdkPath ? { ...process.env, JAVA_HOME: jdkPath } : process.env;

            const { stdout, stderr } = await execAsync(command, { cwd: this.projectRoot, env });
            if (stderr) {
                logger.error(stderr);
            }
            return stdout;
        } catch (error) {
            logger.error(error.message);
            throw new Error(`Error running gradle wrapper: ${error.message}`);
        }
    }

    public static async hasValidWrapper(projectRoot: string): Promise<boolean> {
        const propertiesPath = path.join(projectRoot, "gradle", "wrapper", "gradle-wrapper.properties");

        const hasProperties = await fse.pathExists(propertiesPath);
        return hasProperties;
    }
}
