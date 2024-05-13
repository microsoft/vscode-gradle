import { exec } from 'child_process';
import * as util from 'util';
const execAsync = util.promisify(exec);

export class TerminalService {
    static async runCommand(command: string): Promise<string> {
        try {
            const { stdout } = await execAsync(command);
            return stdout;
        } catch (error) {
            console.error(`Error executing command: ${command}`, error);
            throw new Error('Failed to execute command');
        }
    }
}
