import * as util from "util";
import { Logger, LogVerbosity } from "./Logger";

export class LoggerStream {
    private buffer = "";
    constructor(private readonly logger: Logger, private readonly verbosity: LogVerbosity) {}

    public write(bytes: Uint8Array): void {
        const message = new util.TextDecoder("utf-8").decode(bytes);
        const formattedMessage = this.buffer.length ? message : this.logger.format(message.trimLeft(), this.verbosity);
        this.buffer += message;
        this.append(formattedMessage);
    }

    private append(message: string): void {
        this.logger.append(message, this.verbosity);
    }

    public getBuffer(): string {
        return this.buffer;
    }
}
