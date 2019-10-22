import { QuickPickItem } from 'vscode';

export default class GradleTask implements QuickPickItem {
  constructor(
    public readonly label: string,
    public readonly description?: string
  ) {
    this.label = label;
    this.description = description;
  }
}
