import * as vscode from 'vscode';

export class BookmarkedTasksStore {
  private data = new Set<string>();

  private _onDidChange: vscode.EventEmitter<null> = new vscode.EventEmitter<
    null
  >();
  public readonly onDidChange: vscode.Event<null> = this._onDidChange.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    const bookmarkedTasks = this.context.workspaceState.get(
      'bookmarkedTasks',
      []
    );
    bookmarkedTasks.forEach((taskId) => this.data.add(taskId));
  }

  public getTasks(): string[] {
    return Array.from(this.data.values());
  }

  public addTask(taskId: string): void {
    this.data.add(taskId);
    this.fireOnDidChange();
  }

  public removeTask(taskId: string): void {
    this.data.delete(taskId);
    this.fireOnDidChange();
  }

  private fireOnDidChange(): void {
    this.context.workspaceState.update('bookmarkedTasks', this.getTasks());
    this._onDidChange.fire(null);
  }
}
