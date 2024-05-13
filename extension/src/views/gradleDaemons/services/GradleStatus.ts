import { TerminalService } from './TerminalService';
import { DaemonInfo, DaemonStatus } from '../models/DaemonInfo';

export class GradleStatus {
    static async getDaemonsStatusList(projectRoot: string): Promise<DaemonInfo[]> {
        const command = `cd ${projectRoot} && gradle --status --quiet`;
        const output = await TerminalService.runCommand(command);
        return this.parseDaemonInfo(output);
    }

    private static parseDaemonInfo(output: string): DaemonInfo[] {
        if (!output) return [];

        const lines = output.split('\n');
        const daemonInfos: DaemonInfo[] = [];

        const statusRegex = /^\s*([0-9]+)\s+(\w+)\s+(.+)$/;

        lines.forEach(line => {
            const match = line.match(statusRegex);
            if (match) {
                const pid = match[1];
                const statusString = match[2];
                const info = match[3];

                let status = DaemonStatus[statusString as keyof typeof DaemonStatus];

                daemonInfos.push(new DaemonInfo(pid, status, info));
            }
        });

        return daemonInfos;
    }
}

async function main() {
    const projectRoot = '../../../../..';
    const daemonInfo = await GradleStatus.getDaemonsStatusList(projectRoot);
    console.log(daemonInfo);
}

main()
