import { DaemonStatus } from "./DaemonStatus";

export class DaemonInfo {
    constructor(private pid: string, private status: DaemonStatus, private info: string) {}

    public getPid(): string {
        return this.pid;
    }

    public getStatus(): DaemonStatus {
        return this.status;
    }

    public getInfo(): string {
        return this.info;
    }

    public setStatus(status: DaemonStatus): void {
        this.status = status;
    }

    public setInfo(info: string): void {
        this.info = info;
    }

    public setPid(pid: string): void {
        this.pid = pid;
    }
}
