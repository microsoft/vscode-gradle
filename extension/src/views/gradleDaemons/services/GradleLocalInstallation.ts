import { exec } from "child_process";
import { promisify } from "util";
import { GradleExecution } from "./GradleExecution";
const execAsync = promisify(exec);

export class GradleLocalInstallation implements GradleExecution {
    private gradleHomePath: string;

    constructor(gradleHomePath: string) {
        this.gradleHomePath = gradleHomePath;
    }

    async exec(args: string[]): Promise<string> {
        if (args.length === 0) {
            throw new Error("No gradle args supplied");
        }

        const command = `${this.gradleHomePath} ${args.join(" ")}`;

        try {
            const { stdout, stderr } = await execAsync(command);
            if (stderr) {
                throw new Error(`Error running gradle: ${stderr}`);
            }
            return stdout;
        } catch (error) {
            throw new Error(`Error running gradle: ${error.message}`);
        }
    }
}
