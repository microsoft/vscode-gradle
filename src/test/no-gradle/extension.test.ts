import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Without build.gradle Extension Test Suite', () => {
  vscode.window.showInformationMessage('Started all tests');

  test('should be present', () => {
    assert.ok(vscode.extensions.getExtension('richardwillis.vscode-gradle'));
  });

  test('should not activate', () => {
    const extension = vscode.extensions.getExtension(
      'richardwillis.vscode-gradle'
    );
    if (extension) {
      assert.equal(extension.isActive, false);
    }
  });
});
