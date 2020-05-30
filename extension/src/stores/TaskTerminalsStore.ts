// /* eslint-disable @typescript-eslint/no-explicit-any */
// import * as vscode from 'vscode';
// import { StoreMap } from './StoreMap';
// import { taskId } from './types';
// import { GradleTaskDefinition } from '../tasks/GradleTaskDefinition';

// export interface TaskWithTerminal {
//   terminal: vscode.Terminal;
//   definition: GradleTaskDefinition;
// }

// export class TaskTerminalsStore extends StoreMap<
//   taskId,
//   Set<TaskWithTerminal>
// > {
//   public add(taskId: taskId, taskWithTerminal: TaskWithTerminal): void {
//     let set = this.get(taskId);
//     if (!set) {
//       set = new Set<TaskWithTerminal>();
//       this.set(taskId, set);
//     }
//     set.add(taskWithTerminal);
//   }

//   public getList(key: string): TaskWithTerminal[] {
//     const data = super.get(key);
//     return data ? Array.from(data.values()) : [];
//   }
// }
