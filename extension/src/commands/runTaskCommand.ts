import { GradleTaskTreeItem } from '../views';
import { runTask } from '../tasks/taskUtil';
import { Command } from './Command';
import { RootProjectsStore, TaskTerminalsStore } from '../stores';
import { GradleClient } from '../client';

export const COMMAND_RUN_TASK = 'gradle.runTask';

export class RunTaskCommand extends Command {
  constructor(
    private rootProjectsStore: RootProjectsStore,
    private taskTerminalsStore: TaskTerminalsStore,
    private client: GradleClient
  ) {
    super();
  }
  async run(treeItem: GradleTaskTreeItem): Promise<void> {
    if (treeItem && treeItem.task) {
      await runTask(
        this.rootProjectsStore,
        this.taskTerminalsStore,
        treeItem.task,
        this.client
      );
    }
  }
}
