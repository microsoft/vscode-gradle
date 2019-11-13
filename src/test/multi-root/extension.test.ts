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
        tasks = await vscode.tasks.fetchTasks({ type: 'richardwillis.gradle' });
      });

      it('should load groovy default build file tasks', () => {
        const groovyDefaultTask = tasks.find(
          ({ name }) => name === 'helloGroovyDefault'
        );
        assert.ok(groovyDefaultTask);
        if (groovyDefaultTask) {
          assert.equal(groovyDefaultTask.definition.buildFile, 'build.gradle');
        }
      });

      it('should load kotlin default build file tasks', () => {
        const kotlinTask = tasks.find(
          ({ name }) => name === 'helloKotlinDefault'
        );
        assert.ok(kotlinTask);
        if (kotlinTask) {
          assert.equal(kotlinTask.definition.buildFile, 'build.gradle.kts');
        }
      });

      it('should load groovy custom build file tasks', () => {
        const groovyCustomTask = tasks.find(
          ({ name }) => name === 'helloGroovyCustom'
        );
        assert.ok(groovyCustomTask);
        if (groovyCustomTask) {
          assert.equal(
            groovyCustomTask.definition.buildFile,
            'my-custom-build.gradle'
          );
        }
      });

      it('should successfully run a custom task', async () => {
        const task = tasks.find(task => task.name === 'hello');
        assert.ok(task);
        if (task) {
          await vscode.tasks.executeTask(task);
        } else {
          throw new Error('Task not found');
        }
      });

      it('should refresh tasks', async () => {
        await vscode.commands.executeCommand('gradle.refresh');
        const task = (
          await vscode.tasks.fetchTasks({ type: 'richardwillis.gradle' })
        ).find(task => task.name === 'hello');
        assert.ok(task);
      });
    });
  });
});
