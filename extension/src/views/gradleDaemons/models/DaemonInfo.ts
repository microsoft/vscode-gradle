export enum DaemonStatus {
    IDLE = 0,
    BUSY = 1,
    STOPPED = 2,
    STOPPING = 3,
    CANCELED = 4,
}

export class DaemonInfo {

    constructor(
        private readonly pid: string,
        private readonly status: DaemonStatus,
        private readonly info: string) {}


    public getPid(): string {
        return this.pid;
    }

    public getStatus(): DaemonStatus {
        return this.status;
    }

    public getInfo(): string {
        return this.info;
    }

}


