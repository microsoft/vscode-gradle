import { GradleTaskTreeItem } from '../views';
import { runTask } from '../tasks/taskUtil';
import { Command } from './Command';
import { RootProjectsStore, TaskTerminalsStore } from '../stores';
import { GradleClient } from '../client';
export const COMMAND_DEBUG_TASK = 'gradle.debugTask';

export class DebugTaskCommand extends Command {
  constructor(
    private rootProjectsStore: RootProjectsStore,
    private taskTerminalsStore: TaskTerminalsStore,
    private client: GradleClient
  ) {
    super();
  }
  async run(treeItem: GradleTaskTreeItem, args = ''): Promise<void> {
    if (treeItem && treeItem.task) {
      await runTask(
        this.rootProjectsStore,
        this.taskTerminalsStore,
        treeItem.task,
        this.client,
        args,
        true
      );
    }
  }
}
