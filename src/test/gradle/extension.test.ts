import * as assert from 'assert';
import * as vscode from 'vscode';

import TaskRegistry from '../../TaskRegistry';

suite('With build.grade Extension Test Suite', () => {
  test('it should be present', () => {
    assert.ok(vscode.extensions.getExtension('richardwillis.vscode-gradle'));
  });

  test('it should be activated', () => {
    const extension = vscode.extensions.getExtension(
      'richardwillis.vscode-gradle'
    );
    if (extension) {
      assert.equal(extension.isActive, true);
    }
  });

  test('it should load tasks', () => {
    assert.equal(TaskRegistry.getTasks().length > 0, true);
  });

  test('it should successfully run a task', () => {
    return vscode.commands.executeCommand('gradle:runtask', 'build');
  });

  test('it should fail when running a task that fails', () => {
    return assert.rejects(async () =>
      vscode.commands.executeCommand('gradle:runtask', 'INVALID_TASK_NAME')
    );
  });

  test('it should refresh tasks', async () => {
    TaskRegistry.clear();
    await vscode.commands.executeCommand('gradle:refresh');
    assert.equal(TaskRegistry.getTasks().length > 0, true);
  });
});
