import * as util from 'util';
import { logType, Logger } from './logger';

export class LoggerStream {
  private buffer = '';
  constructor(
    private readonly logger: Logger,
    private readonly type: logType
  ) {}

  write(bytes: Uint8Array): void {
    const message = new util.TextDecoder('utf-8').decode(bytes);
    const formattedMessage = this.buffer.length
      ? message
      : this.logger.format(message.trimLeft(), this.type);
    this.buffer += message;
    this.logger.append(formattedMessage);
  }

  getBuffer(): string {
    return this.buffer;
  }
}
