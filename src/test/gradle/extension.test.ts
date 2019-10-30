import * as assert from 'assert';
import * as vscode from 'vscode';

const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';

suite(fixtureName, () => {
  suite('extension', () => {
    test('it should be present', () => {
      assert.ok(vscode.extensions.getExtension('richardwillis.vscode-gradle'));
    });

    test('it should be activated', () => {
      const extension = vscode.extensions.getExtension(
        'richardwillis.vscode-gradle'
      );
      assert.ok(extension);
      if (extension) {
        assert.equal(extension.isActive, true);
      }
    });

    suite('tasks', () => {
      test('it should load tasks', async () => {
        const extension = vscode.extensions.getExtension(
          'richardwillis.vscode-gradle'
        );
        assert.ok(extension);
        if (extension) {
          const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
          assert.equal(tasks.length > 0, true);
        }
      });

      test('it should successfully run a custom task', async () => {
        const task = (await vscode.tasks.fetchTasks({ type: 'gradle' })).find(
          task => task.name === 'hello'
        );
        assert.ok(task);
        if (task) {
          await vscode.tasks.executeTask(task);
        } else {
          throw new Error('Task not found');
        }
      });

      test('it should refresh tasks', async () => {
        const extension = vscode.extensions.getExtension(
          'richardwillis.vscode-gradle'
        );
        assert.ok(extension);
        if (extension) {
          await vscode.commands.executeCommand('gradle.refresh');
          const task = (await vscode.tasks.fetchTasks({ type: 'gradle' })).find(
            task => task.name === 'hello'
          );
          assert.ok(task);
        }
      });
    });
  });
});
