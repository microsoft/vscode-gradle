import { ChildProcess, ExecOptions, exec } from 'child_process';
import spawn from 'cross-spawn';

import Deferred from './Deferred';
import ProcessLogger from './ProcessLogger';

export default class Process {
  childProcess: ChildProcess;
  private deferred: Deferred;
  constructor(
    readonly command: string,
    readonly args?: ReadonlyArray<string>,
    readonly options?: ExecOptions,
    readonly processLogger?: ProcessLogger
  ) {
    this.deferred = new Deferred();
    this.childProcess = spawn(command, args, options);

    let stdoutData = '';
    let stderrData = '';

    const { stdout, stderr } = this.childProcess;

    if (stdout) {
      stdout.on('data', data => {
        stdoutData += data.toString();
      });
      if (processLogger) {
        stdout.pipe(processLogger.stdout);
      }
    }

    if (stderr) {
      stderr.on('data', data => {
        stderrData += data.toString();
      });
      if (processLogger) {
        stderr.pipe(processLogger.stderr);
      }
    }

    this.childProcess.on('close', code => {
      if (code === 0) {
        this.deferred.resolve(stdoutData);
      } else {
        this.deferred.reject(new Error(stderrData));
      }
    });

    this.childProcess.on('error', err => {
      this.deferred.reject(new Error(`Command failed: ${err.toString()}`));
    });
  }

  complete(): Promise<string> {
    return this.deferred.promise;
  }
}
