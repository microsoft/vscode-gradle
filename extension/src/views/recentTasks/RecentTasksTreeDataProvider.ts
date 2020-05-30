// import * as vscode from 'vscode';
// import * as path from 'path';
// import {
//   taskTreeItemMap,
//   workspaceJavaDebugMap,
//   GradleTasksTreeDataProvider,
// } from '../gradleTasks/GradleTasksTreeDataProvider';
// import { GradleTaskTreeItem } from '../gradleTasks/GradleTaskTreeItem';
// import { isWorkspaceFolder } from '../../util';
// import { TaskHistoryWorkspaceTreeItem } from './TaskHistoryWorkspaceTreeItem';
// import { RecentTasksStore } from '../../stores/RecentTasksStore';
// import { NoRecentTasksTreeItem } from './NoRecentTasksTreeItem';
// import {
//   TaskTerminalsStore,
//   TaskWithTerminal,
// } from '../../stores/TaskTerminalsStore';
// import { IconPath } from '../types';
// import { ICON_LOADING, ICON_GRADLE_TASK } from '../constants';
// import { cloneTask } from '../../tasks/taskUtil';
// import { GradleClient } from '../../client/GradleClient';

// interface TaskByArgsGroup {
//   [key: string]: vscode.Terminal[];
// }
// export class RecentTasksTreeDataProvider
//   implements vscode.TreeDataProvider<vscode.TreeItem> {
//   private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null> = new vscode.EventEmitter<vscode.TreeItem | null>();
//   public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this
//     ._onDidChangeTreeData.event;
//   iconPathRunning: IconPath;
//   iconPathIdle: IconPath;

//   constructor(
//     private readonly context: vscode.ExtensionContext,
//     private readonly client: GradleClient,
//     private readonly recentTasksStore: RecentTasksStore,
//     private readonly taskTerminalsStore: TaskTerminalsStore,
//     private readonly gradleTasksTreeDataProvider: GradleTasksTreeDataProvider
//   ) {
//     this.recentTasksStore.onDidChange(() => this.refresh());

//     // TODO: this should go into a singleton
//     this.iconPathRunning = {
//       light: this.context.asAbsolutePath(
//         path.join('resources', 'light', ICON_LOADING)
//       ),
//       dark: this.context.asAbsolutePath(
//         path.join('resources', 'dark', ICON_LOADING)
//       ),
//     };
//     this.iconPathIdle = {
//       light: this.context.asAbsolutePath(
//         path.join('resources', 'light', ICON_GRADLE_TASK)
//       ),
//       dark: this.context.asAbsolutePath(
//         path.join('resources', 'dark', ICON_GRADLE_TASK)
//       ),
//     };
//   }

//   public getStore(): RecentTasksStore {
//     return this.recentTasksStore;
//   }

//   public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
//     return element;
//   }

//   public refresh(treeItem: vscode.TreeItem | null = null): void {
//     this._onDidChangeTreeData.fire(treeItem);
//   }

//   public getParent(element: vscode.TreeItem): vscode.TreeItem | null {
//     if (element instanceof GradleTaskTreeItem) {
//       return element.parentTreeItem || null;
//     }
//     return null;
//   }

//   public async getChildren(
//     element?: vscode.TreeItem
//   ): Promise<vscode.TreeItem[]> {
//     if (element instanceof TaskHistoryWorkspaceTreeItem) {
//       return [...element.tasks];
//     }
//     if (!element) {
//       const treeItems = await this.buildTreeItems();
//       if (!treeItems.length) {
//         return [new NoRecentTasksTreeItem(this.context)];
//       } else {
//         return treeItems;
//       }
//     }
//     return [];
//   }

//   // eslint-disable-next-line sonarjs/cognitive-complexity
//   private async buildTreeItems(): Promise<vscode.TreeItem[]> {
//     const { workspaceFolders } = vscode.workspace;
//     if (!workspaceFolders) {
//       return [];
//     }
//     const recentTasks = this.recentTasksStore.get();

//     const isMultiRoot = workspaceFolders.length > 1;
//     const workspaceTreeItemMap: Map<
//       string,
//       TaskHistoryWorkspaceTreeItem
//     > = new Map();

//     // For performance reasons, we find the associated task via the taskTreeItemMap,
//     // so we need to wait for the treeItems to be built first
//     // TODO: make this a decorator
//     await this.gradleTasksTreeDataProvider.waitForBuildTreeItems();

//     if (taskTreeItemMap.size === 0) {
//       return [];
//     }

//     recentTasks.forEach((definition) => {
//       const treeItem = taskTreeItemMap.get(definition.id);
//       if (!treeItem) {
//         return;
//       }
//       const { task } = treeItem;
//       if (isWorkspaceFolder(task.scope) && task.definition.buildFile) {
//         let workspaceTreeItem = workspaceTreeItemMap.get(task.scope.name);
//         if (!workspaceTreeItem) {
//           workspaceTreeItem = new TaskHistoryWorkspaceTreeItem(task.scope.name);
//           workspaceTreeItemMap.set(task.scope.name, workspaceTreeItem);
//         }

//         const tasksWithTerminals: TaskWithTerminal[] = this.taskTerminalsStore.getList(
//           definition.id
//         );

//         const taskWithTerminalsGroupedbyArgs = tasksWithTerminals.reduce(
//           (previousValue: TaskByArgsGroup, currentValue: TaskWithTerminal) => {
//             const key = currentValue.definition.args || '';
//             if (!previousValue[key]) {
//               previousValue[key] = [];
//             }
//             previousValue[key].push(currentValue.terminal);
//             return previousValue;
//           },
//           {}
//         );
//         Object.keys(taskWithTerminalsGroupedbyArgs).forEach((argKey) => {
//           const terminals = taskWithTerminalsGroupedbyArgs[argKey];
//           const argLabel = argKey ? ` ${argKey} ` : ' ';
//           const label = `${task.name}${argLabel}(${terminals.length})`;
//           const recentTaskTreeItem = new GradleTaskTreeItem(
//             workspaceTreeItem!,
//             cloneTask(
//               task,
//               definition.args,
//               this.client,
//               this.taskTerminalsStore,
//               definition.javaDebug
//             ),
//             label,
//             definition.description,
//             this.iconPathRunning!,
//             this.iconPathIdle!,
//             workspaceJavaDebugMap.get(path.basename(definition.workspaceFolder))
//           );
//           workspaceTreeItem!.addTask(recentTaskTreeItem);
//         });
//       }
//     });

//     if (!workspaceTreeItemMap.size) {
//       return [];
//     } else if (isMultiRoot) {
//       return [...workspaceTreeItemMap.values()];
//     } else {
//       return [...workspaceTreeItemMap.values().next().value.tasks];
//     }
//   }
// }
