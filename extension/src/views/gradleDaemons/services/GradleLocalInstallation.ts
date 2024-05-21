import { GradleExecution } from "./GradleExecution";
import { execAsync } from "../../../util/execAsync";
export class GradleLocalInstallation implements GradleExecution {
    private gradleHomePath: string;

    constructor(gradleHomePath: string) {
        this.gradleHomePath = gradleHomePath;
    }

    public async exec(args: string[]): Promise<string> {
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
