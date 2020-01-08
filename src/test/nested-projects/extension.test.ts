import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';

import { waitForExplorerRefresh } from '../testUtil';

const extensionName = 'richardwillis.vscode-gradle';
const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';

describe(fixtureName, () => {
  it('should be present', () => {
    assert.ok(vscode.extensions.getExtension(extensionName));
  });

  it('should be activated', () => {
    const extension = vscode.extensions.getExtension(extensionName);
    assert.ok(extension);
    if (extension) {
      assert.equal(extension.isActive, true);
    }
  });

  describe('tasks', () => {
    it('should load gradle tasks', async () => {
      const extension = vscode.extensions.getExtension(extensionName);
      assert.ok(extension);
      await waitForExplorerRefresh(extension);
      const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
      assert.ok(tasks);
      assert.equal(tasks!.length > 0, true);

      const helloGroovyDefaultTask = tasks!.find(
        ({ definition }) => definition.script === 'helloGroovyDefault'
      );
      assert.ok(helloGroovyDefaultTask);
      assert.equal(
        path.basename(helloGroovyDefaultTask!.definition.projectFolder),
        'gradle-groovy-default-build-file'
      );
      assert.equal(
        helloGroovyDefaultTask!.name,
        'helloGroovyDefault - gradle-groovy-default-build-file'
      );

      const helloGroovyCustomTask = tasks!.find(
        ({ definition }) => definition.script === 'helloGroovyCustom'
      );
      assert.ok(helloGroovyCustomTask);
      assert.equal(
        path.basename(helloGroovyCustomTask!.definition.projectFolder),
        'gradle-groovy-custom-build-file'
      );
      assert.equal(
        helloGroovyCustomTask!.name,
        'helloGroovyCustom - gradle-groovy-custom-build-file'
      );
      const helloKotlinDefaultTask = tasks!.find(
        ({ definition }) => definition.script === 'helloKotlinDefault'
      );
      assert.ok(helloKotlinDefaultTask);
      assert.equal(
        path.basename(helloKotlinDefaultTask!.definition.projectFolder),
        'gradle-kotlin-default-build-file'
      );
      assert.equal(
        helloKotlinDefaultTask!.name,
        'helloKotlinDefault - gradle-kotlin-default-build-file'
      );
      const helloGroovySubSubProjectTask = tasks!.find(
        ({ definition }) =>
          definition.script ===
          'subproject-example:sub-subproject-example:helloGroovySubSubProject'
      );
      assert.ok(helloGroovySubSubProjectTask);
      assert.equal(
        path.basename(helloGroovySubSubProjectTask!.definition.projectFolder),
        'multi-project'
      );
      assert.equal(
        helloGroovySubSubProjectTask!.name,
        'subproject-example:sub-subproject-example:helloGroovySubSubProject - multi-project'
      );
    });

    it('should run a gradle task', async () => {
      const extension = vscode.extensions.getExtension(extensionName);
      assert.ok(extension);
      const task = (await vscode.tasks.fetchTasks({ type: 'gradle' })).find(
        ({ definition }) =>
          definition.script ===
          'subproject-example:sub-subproject-example:helloGroovySubSubProject'
      );
      assert.ok(task);

      const stub = sinon.stub(extension!.exports.logger, 'info');
      await new Promise(resolve => {
        vscode.tasks.onDidEndTaskProcess(e => {
          if (e.execution.task === task) {
            resolve();
          }
        });
        vscode.tasks.executeTask(task!);
      });
      assert.ok(stub.calledWith(sinon.match('Hello, World! SubSubProject')));
    });
  });
});
