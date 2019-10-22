import { window, OutputChannel } from 'vscode';
import { ChildProcess, ExecOptions } from 'child_process';
import Process from './Process';
import { Writable } from 'stream';

import ProcessLogger from './ProcessLogger';

const processes: Set<ChildProcess> = new Set();

function add(process: ChildProcess) {
  processes.add(process);
}

function remove(process: ChildProcess) {
  processes.delete(process);
}

function killAll() {
  processes.forEach((process: ChildProcess, _: ChildProcess) => {
    process.kill('SIGINT');
  });
  window.showInformationMessage(
    `Killed ${processes.size} process${processes.size === 1 ? '' : 'es'}`
  );
  processes.clear();
}

function create(
  command: string,
  options: ExecOptions,
  outputChannel?: OutputChannel
): Thenable<string> {
  let processLogger: ProcessLogger | undefined;

  if (outputChannel) {
    processLogger = new ProcessLogger(outputChannel);
  }

  const process = new Process(command, options, processLogger);
  const childProcess = process.childProcess;

  add(childProcess);

  return process.complete().then(
    stdout => {
      remove(childProcess);
      return stdout;
    },
    err => {
      remove(childProcess);
      return Promise.reject(err);
    }
  );
}

export default { remove, killAll, create };
