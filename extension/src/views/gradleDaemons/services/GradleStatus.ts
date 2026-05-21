import { DaemonInfo } from "../models/DaemonInfo";
import { DaemonStatus } from "../models/DaemonStatus";
import { getGradleConfig } from "../../../util/config";
import { GradleConfig } from "../../../proto/gradle_pb";
import { GradleWrapper } from "./GradleWrapper";
import { GradleLocalInstallation } from "./GradleLocalInstallation";
import { GradleConnectionType } from "../models/GradleConnectionType";
export class GradleStatus {
    public static async getConnectionType(gradleConfig: GradleConfig): Promise<GradleConnectionType> {
        if (gradleConfig.getWrapperEnabled()) {
            return GradleConnectionType.WRAPPER;
        } else {
            if (gradleConfig.getVersion()) {
                return GradleConnectionType.SPECIFICVERSION;
            } else if (gradleConfig.getGradleHome()) {
                return GradleConnectionType.LOCALINSTALLATION;
            }
            return GradleConnectionType.WRAPPER;
        }
    }

    private static async getDaemonsStatusOutput(gradleConfig: GradleConfig, projectRoot: string): Promise<string> {
        const connectionType = await this.getConnectionType(gradleConfig);
        switch (connectionType) {
            case GradleConnectionType.WRAPPER:
                if (await GradleWrapper.hasValidWrapper(projectRoot)) {
                    const wrapper = new GradleWrapper(projectRoot);
                    return wrapper.exec(["--status", "quiet"]);
                }
                return "";
            case GradleConnectionType.LOCALINSTALLATION:
                const localInstallation = new GradleLocalInstallation(gradleConfig.getGradleHome());
                return localInstallation.exec(["--status", "quiet"]);
            case GradleConnectionType.SPECIFICVERSION:
                return "";
            default:
                throw new Error("Unknown connection type");
        }
    }

    public static async getDaemonsStatusList(projectRoot: string): Promise<DaemonInfo[]> {
        const gradleConfig = getGradleConfig();
        const output = await this.getDaemonsStatusOutput(gradleConfig, projectRoot);

        return this.parseDaemonInfo(output);
    }

    public static parseDaemonInfo(output: string): DaemonInfo[] {
        if (!output) return [];

        const lines = output.split(/\r?\n/);
        const daemonInfos: DaemonInfo[] = [];

        const statusRegex = /^\s*([0-9]+)\s+(\w+)\s+(.+)$/;

        lines.forEach((line) => {
            const match = line.match(statusRegex);
            if (match) {
                const pid = match[1];
                const statusString = match[2];
                const info = match[3];

                const status = statusString as DaemonStatus;

                daemonInfos.push(new DaemonInfo(pid, status, info));
            }
        });

        return daemonInfos;
    }
}
