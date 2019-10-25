import { ChildProcess } from 'child_process';
import { ShellExecutionOptions } from 'vscode';
import spawn from 'cross-spawn';

import Deferred from './Deferred';

export default class Process {
  private childProcess: ChildProcess | void = undefined;
  private deferred: Deferred;
  constructor(
    readonly command: string,
    readonly args?: ReadonlyArray<string>,
    readonly options?: ShellExecutionOptions
  ) {
    this.deferred = new Deferred();
  }

  spawn(): Promise<string> {
    this.childProcess = spawn(this.command, this.args, this.options);

    let stdoutData = '';
    let stderrData = '';

    const { stdout, stderr } = this.childProcess;

    if (stdout) {
      stdout.on('data', data => {
        stdoutData += data.toString();
      });
    }

    if (stderr) {
      stderr.on('data', data => {
        stderrData += data.toString();
      });
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

    return this.deferred.promise;
  }
}
