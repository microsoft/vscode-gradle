import { promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { GradleExecution } from "./GradleExecution";
import * as path from "path";

const execAsync = promisify(exec);

export class GradleWrapper implements GradleExecution {
    private gradleWrapperPath: string;
    constructor(private projectRoot: string) {
        const wrapperName = process.platform === "win32" ? "gradlew.bat" : "gradlew";
        this.gradleWrapperPath = path.join(projectRoot, wrapperName);
    }

    async exec(args: string[]): Promise<string> {
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

    static async hasValidWrapper(projectRoot: string): Promise<boolean> {
        try {
            const propertiesPath = path.join(projectRoot, "gradle", "wrapper", "gradle-wrapper.properties");
            const wrapperName = process.platform === "win32" ? "gradlew.bat" : "gradlew";
            const wrapperPath = path.join(projectRoot, wrapperName);

            await fs.access(propertiesPath);
            await fs.access(wrapperPath);
            return true;
        } catch {
            return false;
        }
    }
}
