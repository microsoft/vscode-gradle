import * as fse from "fs-extra";
import { execAsync } from "../../../util/execAsync";
import { GradleExecution } from "./GradleExecution";
import * as path from "path";

export class GradleWrapper implements GradleExecution {
    private gradleWrapperPath: string;
    constructor(private projectRoot: string) {
        const wrapperName = process.platform === "win32" ? "gradlew.bat" : "gradlew";
        this.gradleWrapperPath = path.join(projectRoot, wrapperName);
    }

    public async exec(args: string[]): Promise<string> {
        if (args.length === 0) {
            throw new Error("No wrapper args supplied");
        }

        const command = `${this.gradleWrapperPath} ${args.join(" ")}`;
        try {
            const { stdout, stderr } = await execAsync(command, { cwd: this.projectRoot });
            if (stderr) {
                throw new Error(`Error running gradle wrapper: ${stderr}`);
            }
            return stdout;
        } catch (error) {
            throw new Error(`Error running gradle wrapper: ${error.message}`);
        }
    }

    public static async hasValidWrapper(projectRoot: string): Promise<boolean> {
        const propertiesPath = path.join(projectRoot, "gradle", "wrapper", "gradle-wrapper.properties");

        const hasProperties = await fse.pathExists(propertiesPath);
        return hasProperties;
    }
}
