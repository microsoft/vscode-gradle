import { Extension } from '../extension';
export const COMMAND_CANCEL_COMMAND = 'gradle.cancelCommand';

export async function cancelCommandCommand(
  projectFolder: string,
  args: Array<string>
): Promise<void> {
  Extension.getInstance().getClient().cancelRunCommand(projectFolder, args);
}
