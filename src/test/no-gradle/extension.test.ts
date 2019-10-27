import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Without build.gradle Extension Test Suite', () => {
  test('it should not be present', () => {
    assert.ok(vscode.extensions.getExtension('richardwillis.vscode-gradle'));
  });

  test('it should not be activated', async () => {
    const extension = vscode.extensions.getExtension(
      'richardwillis.vscode-gradle'
    );
    if (extension) {
      assert.equal(extension.isActive, false);
      const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
      assert.equal(tasks.length === 0, true);
    }
  });
});
