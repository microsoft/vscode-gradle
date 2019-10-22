import { OutputChannel } from 'vscode';
import { Writable } from 'stream';

function createWriter(logger: (output: string) => void): Writable {
  return new Writable({
    write: (chunk, enc, next) => {
      logger(chunk.toString());
      next();
    }
  });
}

export default class ProcessLogger {
  public stdout: Writable;
  public stderr: Writable;
  constructor(readonly outputChannel: OutputChannel) {
    this.stdout = createWriter(output => this.outputChannel.append(output));
    this.stderr = createWriter(output =>
      this.outputChannel.append(`[ERR] ${output}`)
    );
  }
}
