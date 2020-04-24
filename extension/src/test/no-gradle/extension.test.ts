import * as assert from 'assert';
import * as vscode from 'vscode';
import { teardownSubscriptions } from '../testUtil';

const extensionName = 'richardwillis.vscode-gradle';

describe('without any build file or local gradle wrapper', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let extension: vscode.Extension<any> | undefined;

  before(() => {
    extension = vscode.extensions.getExtension(extensionName);
  });

  after(() => {
    if (extension) {
      teardownSubscriptions(extension.exports.context);
    }
  });

  it('should be present', () => {
    assert.ok(extension);
  });

  it('should not be activated', async () => {
    assert.ok(extension);
    assert.equal(extension!.isActive, false);
    const tasks = await vscode.tasks.fetchTasks({
      type: 'gradle',
    });
    assert.equal(tasks.length === 0, true);
  });
});
