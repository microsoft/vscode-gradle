import * as assert from 'assert';
import * as vscode from 'vscode';

const extensionName = 'richardwillis.vscode-gradle';

describe('without any build file or local gradle wrapper', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let extension: vscode.Extension<any> | undefined;

  before(() => {
    extension = vscode.extensions.getExtension(extensionName);
  });

  it('should be present', () => {
    assert.ok(extension);
  });

  it('should not be activated', async () => {
    assert.ok(extension);
    assert.equal(extension!.isActive, false);
    // This promise never resolves. Seems like this behaviour was changed in vscode-1.45.0
    // const tasks = await vscode.tasks.fetchTasks({
    //   type: 'fooo',
    // });
    // assert.equal(tasks.length === 0, true);
  });
});
