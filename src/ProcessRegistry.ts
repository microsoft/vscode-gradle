import { window, OutputChannel } from "vscode";
import { ChildProcess, ExecException, exec } from "child_process";

const processes: Set<ChildProcess> = new Set();

function add(process: ChildProcess): void {
  processes.add(process);
}

function remove(process: ChildProcess): void {
  processes.delete(process);
}

function killAll(): void {
  processes.forEach((process: ChildProcess, _: ChildProcess) => {
    process.kill("SIGINT");
  });
  window.showInformationMessage(
    `Killed ${processes.size} process${processes.size === 1 ? "" : "es"}`
  );
  processes.clear();
}

function create(
  command: string,
  options: Object,
  callback: (
    error: ExecException,
    stdout: string | Buffer,
    stderr: string | Buffer
  ) => void
): ChildProcess {
  const process = exec(command, options, callback);
  add(process);
  process.on("exit", () => remove(process));
  return process;
}

function writeOutput(process: ChildProcess, outputChannel: OutputChannel) {
  outputChannel.show();
  process.stdout.on("data", data => outputChannel.append(data.toString()));
  process.stderr.on("data", data => outputChannel.append("[ERR] " + data));
}

export default { remove, killAll, create, writeOutput };
