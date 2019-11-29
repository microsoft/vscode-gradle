import * as assert from 'assert';
import * as vscode from 'vscode';

const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';

describe(fixtureName, () => {
  describe('extension', () => {
    it('should be present', () => {
      assert.ok(vscode.extensions.getExtension('richardwillis.vscode-gradle'));
    });

    it('should be activated', () => {
      const extension = vscode.extensions.getExtension(
        'richardwillis.vscode-gradle'
      );
      assert.ok(extension);
      if (extension) {
        assert.equal(extension.isActive, true);
      }
    });

    describe('tasks', () => {
      let tasks: vscode.Task[];

      beforeEach(async () => {
        tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
      });

      it('should load groovy default build file tasks', () => {
        const groovyDefaultTask = tasks.find(
          ({ name }) => name === 'helloGroovyDefault'
        );
        assert.ok(groovyDefaultTask);
        assert.equal(groovyDefaultTask!.definition.project, 'gradle');
      });

      it('should load kotlin default build file tasks', () => {
        const kotlinTask = tasks.find(
          ({ name }) => name === 'helloKotlinDefault'
        );
        assert.ok(kotlinTask);
        assert.equal(kotlinTask!.definition.project, 'gradle-kotlin');
      });

      it('should load groovy custom build file tasks', () => {
        const groovyCustomTask = tasks.find(
          ({ name }) => name === 'helloGroovyCustom'
        );
        assert.ok(groovyCustomTask);
        assert.equal(
          groovyCustomTask!.definition.project,
          'gradle-groovy-custom-build-file'
        );
      });

      it('should successfully run a custom task', done => {
        const task = tasks.find(task => task.name === 'hello');
        assert.ok(task);
        vscode.tasks.onDidEndTaskProcess(e => {
          if (e.execution.task === task) {
            done(e.exitCode === 0 ? undefined : 'Process error');
          }
        });
        vscode.tasks.executeTask(task!);
      });

      it('should refresh tasks', async () => {
        await vscode.commands.executeCommand('gradle.refresh');
        const task = (await vscode.tasks.fetchTasks({ type: 'gradle' })).find(
          task => task.name === 'hello'
        );
        assert.ok(task);
      });
    });
  });
});
