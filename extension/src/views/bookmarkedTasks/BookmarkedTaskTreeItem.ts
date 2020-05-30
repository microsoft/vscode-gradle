import { GradleTaskTreeItem } from '../gradleTasks/GradleTaskTreeItem';
import { getTreeItemState } from '../viewUtil';

export class BookmarkedTaskTreeItem extends GradleTaskTreeItem {
  public setContext(): void {
    // Update the state of this treeItem when the args match, to prevent showing a running state
    // for a task without args AND a tag with args
    this.contextValue = getTreeItemState(
      this.task,
      this.javaDebug,
      this.task.definition.args
    );
    this.setIconState();
  }
}
