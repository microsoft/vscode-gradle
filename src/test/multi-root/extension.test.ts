import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

const extensionName = 'richardwillis.vscode-gradle';
const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';

describe(fixtureName, () => {
  describe('extension', () => {
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
      let tasks: vscode.Task[] | undefined;

      beforeEach(async () => {
        tasks = await vscode.commands.executeCommand('gradle.refresh');
      });

      it('should load groovy default build file tasks', () => {
        const groovyDefaultTask = tasks!.find(
          ({ name }) => name === 'helloGroovyDefault'
        );
        assert.ok(groovyDefaultTask);
        assert.equal(groovyDefaultTask!.definition.project, 'gradle');
      });

      it('should load kotlin default build file tasks', () => {
        const kotlinTask = tasks!.find(
          ({ name }) => name === 'helloKotlinDefault'
        );
        assert.ok(kotlinTask);
        assert.equal(kotlinTask!.definition.project, 'gradle-kotlin');
      });

      it('should load groovy custom build file tasks', () => {
        const groovyCustomTask = tasks!.find(
          ({ name }) => name === 'helloGroovyCustom'
        );
        assert.ok(groovyCustomTask);
        assert.equal(
          groovyCustomTask!.definition.project,
          'gradle-groovy-custom-build-file'
        );
      });

      it('should successfully run a custom task', async () => {
        const extension = vscode.extensions.getExtension(extensionName);
        assert.ok(extension);

        const task = tasks!.find(({ name }) => name === 'hello');
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
          outputChannel.appendLine.calledWith(sinon.match('Hello, World!'))
        );
      });

      it('should refresh tasks', async () => {
        await vscode.commands.executeCommand('gradle.refresh');
        const task = (await vscode.tasks.fetchTasks({ type: 'gradle' })).find(
          ({ name }) => name === 'hello'
        );
        assert.ok(task);
      });
    });
  });
});
