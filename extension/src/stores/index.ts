import * as vscode from 'vscode';
import { BookmarkedTasksStore } from './BookmarkedTasksStore';
import { RecentTasksStore } from './RecentTasksStore';
// import { TaskTerminalsStore } from './TaskTerminalsStore';
export function registerStores(
  context: vscode.ExtensionContext
): {
  bookmarkedTasksStore: BookmarkedTasksStore;
  recentTasksStore: RecentTasksStore;
  // taskTerminalsStore: TaskTerminalsStore;
} {
  const bookmarkedTasksStore = new BookmarkedTasksStore(context);
  const recentTasksStore = new RecentTasksStore();
  // const taskTerminalsStore = new TaskTerminalsStore();
  context.subscriptions.push(
    bookmarkedTasksStore,
    recentTasksStore
    // taskTerminalsStore
  );
  return {
    bookmarkedTasksStore,
    recentTasksStore,
    // taskTerminalsStore,
  };
}
