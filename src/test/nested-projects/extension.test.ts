import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

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
      const tasks:
        | vscode.Task[]
        | undefined = await vscode.commands.executeCommand('gradle.refresh');
      assert.ok(tasks);
      assert.equal(tasks!.length > 0, true);
      const helloGroovyDefaultTask = tasks!.find(
        ({ definition }) => definition.script === 'helloGroovyDefault'
      );
      assert.ok(helloGroovyDefaultTask);
      assert.equal(
        helloGroovyDefaultTask!.name,
        'helloGroovyDefault - gradle-groovy-default-build-file'
      );
      const helloGroovyCustomTask = tasks!.find(
        ({ definition }) => definition.script === 'helloGroovyCustom'
      );
      assert.ok(helloGroovyCustomTask);
      assert.equal(
        helloGroovyCustomTask!.name,
        'helloGroovyCustom - gradle-groovy-custom-build-file'
      );
      const helloKotlinDefaultTask = tasks!.find(
        ({ definition }) => definition.script === 'helloKotlinDefault'
      );
      assert.ok(helloKotlinDefaultTask);
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

      const outputChannel = extension!.exports.outputChannel;
      sinon.stub(outputChannel, 'appendLine');
      await new Promise(resolve => {
        vscode.tasks.onDidEndTaskProcess(e => {
          if (e.execution.task === task) {
            resolve();
          }
        });
        vscode.tasks.executeTask(task!);
      });
      assert.ok(
        outputChannel.appendLine.calledWith(
          sinon.match('Hello, World! SubSubProject')
        )
      );
    });
  });
});
