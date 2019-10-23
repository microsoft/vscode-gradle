import { window, OutputChannel } from 'vscode';
import { ChildProcess, ExecOptions } from 'child_process';
import Process from './Process';
import { Writable } from 'stream';

import ProcessLogger from './ProcessLogger';

const processes: Set<Process> = new Set();

function add(process: Process) {
  processes.add(process);
}

function remove(process: Process) {
  processes.delete(process);
}

function killAll() {
  processes.forEach((process: Process, _: Process) => {
    process.childProcess.kill('SIGINT');
  });
  window.showInformationMessage(
    `Killed ${processes.size} process${processes.size === 1 ? '' : 'es'}`
  );
  processes.clear();
}

function create(
  command: string,
  args?: ReadonlyArray<string>,
  options?: ExecOptions,
  outputChannel?: OutputChannel
): Promise<string> {
  let processLogger: ProcessLogger | undefined;
  if (outputChannel) {
    processLogger = new ProcessLogger(outputChannel);
  }
  const process = new Process(command, args, options, processLogger);
  add(process);
  return process.complete().finally(() => {
    remove(process);
  });
}

export default { remove, killAll, create };
