import { GradleTaskTreeItem } from '..';
import { getTreeItemState } from '../viewUtil';
import { GradleTaskDefinition } from '../../tasks';

export class PinnedTaskTreeItem extends GradleTaskTreeItem {
  public setContext(): void {
    const definition = this.task.definition as GradleTaskDefinition;
    // Update the state of this treeItem when the args match, to prevent showing a running state
    // for a task without args AND a tag with args
    this.contextValue = getTreeItemState(
      this.task,
      this.javaDebug,
      this.task.definition.args
    );
    this.tooltip =
      (definition.args ? `(args: ${definition.args}) ` : '') +
      (definition.description || this.label);
    this.setIconState();
  }
}
