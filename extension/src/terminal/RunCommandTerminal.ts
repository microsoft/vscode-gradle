import * as vscode from 'vscode';
import { Extension } from '../extension';
import { GradleRunnerTerminal } from './GradleRunnerTerminal';
import { COMMAND_CANCEL_COMMAND } from '../commands/cancelCommandCommand';

export class RunCommandTerminal extends GradleRunnerTerminal
  implements vscode.Pseudoterminal {
  private args?: ReadonlyArray<string>;

  public setArgs(args: ReadonlyArray<string>): void {
    this.args = args;
  }

  public close(): void {
    this.cancelCommand();
  }

  protected async runCommand(): Promise<void> {
    try {
      const runCommand = Extension.getInstance()
        .getClient()
        .runCommand(
          this.rootProject.getProjectUri().fsPath,
          this.args,
          this.handleOutput
        );
      await runCommand;
    } catch (e) {
      this.handleError(e);
    } finally {
      this.closeEmitter.fire();
    }
  }

  protected cancelCommand(): void {
    vscode.commands.executeCommand(
      COMMAND_CANCEL_COMMAND,
      this.rootProject.getProjectUri().fsPath,
      this.args
    );
  }
}
