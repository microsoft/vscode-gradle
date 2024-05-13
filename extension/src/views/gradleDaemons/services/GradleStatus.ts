import { DaemonInfo, DaemonStatus } from '../models/DaemonInfo';
import { getGradleConfig } from "../../../util/config";
import { GradleConfig } from "../../../proto/gradle_pb";
import { GradleWrapper } from './GradleWrapper';
import { GradleLocalInstallation } from './GradleLocalInstallation';
enum ConnectionType {
    WRAPPER,
    LOCALINSTALLATION,
    SPECIFICVERSION
}
export class GradleStatus {
    static async getConnectionType(gradleConfig: GradleConfig): Promise<ConnectionType> {
        if (gradleConfig.getWrapperEnabled()) {
            return ConnectionType.WRAPPER;
        } else {
            if (gradleConfig.getVersion()) {
                return ConnectionType.SPECIFICVERSION;
            }else if (gradleConfig.getGradleHome()) {
                return ConnectionType.LOCALINSTALLATION;
            }
            // Previously use tooling version as fallback in Java.
            return ConnectionType.SPECIFICVERSION;
        }
    }

    static async getDaemonsStatusOutput(gradleConfig: GradleConfig, projectRoot: string): Promise<string> {
        const connectionType = await this.getConnectionType(gradleConfig);
        switch (connectionType) {
            case ConnectionType.WRAPPER:
                if (await GradleWrapper.hasValidWrapper(projectRoot)) {
                    const wrapper = new GradleWrapper(projectRoot);
                    return wrapper.exec(['--status', 'quiet']);
                } else {
                    throw new Error("Invalid or missing Gradle wrapper files.");
                }

            case ConnectionType.LOCALINSTALLATION:
                const localInstallation = new GradleLocalInstallation(gradleConfig.getGradleHome());
                return localInstallation.exec(['--status', 'quiet']);

            case ConnectionType.SPECIFICVERSION:
                return `not implemented yet`;
            default:
                throw new Error('Unknown connection type');
        }
    }

    static async getDaemonsStatusList(projectRoot: string): Promise<DaemonInfo[]> {
        const gradleConfig = getGradleConfig();

        const output = await this.getDaemonsStatusOutput(gradleConfig, projectRoot);

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

