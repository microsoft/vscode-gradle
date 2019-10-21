import { window, OutputChannel } from 'vscode';
import { ChildProcess, ExecOptions, exec } from 'child_process';

const processes: Set<ChildProcess> = new Set();

function add(process: ChildProcess): void {
  processes.add(process);
}

function remove(process: ChildProcess): void {
  processes.delete(process);
}

function killAll(): void {
  processes.forEach((process: ChildProcess, _: ChildProcess) => {
    process.kill('SIGINT');
  });
  window.showInformationMessage(
    `Killed ${processes.size} process${processes.size === 1 ? '' : 'es'}`
  );
  processes.clear();
}

function writeOutput(
  { stdout, stderr }: ChildProcess,
  outputChannel: OutputChannel
) {
  outputChannel.show();
  if (stdout) {
    stdout.on('data', data => outputChannel.append(data.toString()));
  }
  if (stderr) {
    stderr.on('data', data => outputChannel.append('[ERR] ' + data));
  }
}

function create(
  command: string,
  options: ExecOptions,
  outputChannel?: OutputChannel
): Thenable<string> {
  return new Promise((resolve, reject) => {
    const process = exec(command, options, (err, stdout) => {
      return err ? reject(err) : resolve(stdout.toString());
    });
    add(process);
    process.on('exit', () => remove(process));
    if (outputChannel) {
      writeOutput(process, outputChannel);
    }
  });
}

export default { remove, killAll, create, writeOutput };
