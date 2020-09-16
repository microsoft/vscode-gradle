import * as vscode from 'vscode';
import * as path from 'path';
import { DaemonInfo } from '../../proto/gradle_pb';
import { DAEMON_ICON_MAP } from '../constants';

interface StatusEnumMapByValue {
  [key: number]: string;
}

const daemonStatusEnumMapByValue: StatusEnumMapByValue = Object.assign(
  {},
  ...Object.entries(DaemonInfo.DaemonStatus).map(([a, b]) => ({
    [b]: a,
  }))
);

export class GradleDaemonTreeItem extends vscode.TreeItem {
  constructor(
    private readonly context: vscode.ExtensionContext,
    public readonly label: string,
    private readonly daemonInfo: DaemonInfo
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    const iconName = DAEMON_ICON_MAP[daemonInfo.getStatus()];
    this.iconPath = {
      light: this.context.asAbsolutePath(
        path.join('resources', 'light', iconName)
      ),
      dark: this.context.asAbsolutePath(
        path.join('resources', 'dark', iconName)
      ),
    };
    this.contextValue = this.status.toLowerCase();
    this.tooltip = `${this.status} - ${this.daemonInfo.getInfo()}`;
    this.description = this.status;
  }

  private get status(): string {
    return daemonStatusEnumMapByValue[this.daemonInfo.getStatus()];
  }
  public get pid(): string {
    return this.daemonInfo.getPid();
  }
}
