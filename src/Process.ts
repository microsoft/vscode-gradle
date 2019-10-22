import { ChildProcess, ExecOptions, exec } from 'child_process';

import Deferred from './Deferred';
import ProcessLogger from './ProcessLogger';

export default class Process {
  childProcess: ChildProcess;
  private deferred: Deferred;
  constructor(
    readonly command: string,
    readonly options: ExecOptions,
    readonly processLogger?: ProcessLogger
  ) {
    this.deferred = new Deferred();

    this.childProcess = exec(this.command, this.options, (err, stdout) =>
      err ? this.deferred.reject(err) : this.deferred.resolve(stdout.toString())
    );

    if (processLogger) {
      if (this.childProcess.stdout) {
        this.childProcess.stdout.pipe(processLogger.stdout);
      }
      if (this.childProcess.stderr) {
        this.childProcess.stderr.pipe(processLogger.stderr);
      }
    }
  }

  complete(): Thenable<string> {
    return this.deferred.promise;
  }
}
