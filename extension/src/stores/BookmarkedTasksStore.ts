import * as vscode from 'vscode';

export class BookmarkedTasksStore {
  private data = new Set<string>();

  private _onDidChange: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onDidChange: vscode.Event<null> = this._onDidChange.event;

  getTasks(): string[] {
    return Array.from(this.data.values());
  }

  addTask(taskId: string): void {
    this.data.add(taskId);
    this._onDidChange.fire(null);
  }
}
