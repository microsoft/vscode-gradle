import * as vscode from 'vscode';
import { TaskStore } from './TaskStore';
import { TaskArgs, TaskId } from './types';

interface WorkspaceStateTasks {
  [key: string]: TaskArgs[];
}

const toWorkspaceStateTasks = (
  map: Map<TaskId, Set<TaskArgs>>
): WorkspaceStateTasks => {
  return Array.from(map.keys()).reduce(
    (workspaceStateTasks: WorkspaceStateTasks, key: string) => {
      workspaceStateTasks[key] = Array.from(map.get(key)!.values());
      return workspaceStateTasks;
    },
    {}
  );
};

export class BookmarkedTasksStore extends TaskStore {
  private static instance: BookmarkedTasksStore;
  public static getInstance(): BookmarkedTasksStore {
    return BookmarkedTasksStore.instance;
  }
  constructor(private readonly context: vscode.ExtensionContext) {
    super();
    const bookmarkedTasks = this.context.workspaceState.get(
      'bookmarkedTasks',
      {}
    ) as WorkspaceStateTasks;
    if (Array.isArray(bookmarkedTasks)) {
      return;
    }
    Object.keys(bookmarkedTasks).forEach((taskId: TaskId) => {
      this.setItem(taskId, new Set(bookmarkedTasks[taskId]), false);
    });
    BookmarkedTasksStore.instance = this;
  }

  protected fireOnDidChange(): void {
    const workspaceStateTasks: WorkspaceStateTasks = toWorkspaceStateTasks(
      this.getData()
    );
    this.context.workspaceState.update('bookmarkedTasks', workspaceStateTasks);
    super.fireOnDidChange();
  }
}
