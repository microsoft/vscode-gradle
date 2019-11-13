import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';

describe(fixtureName, () => {
  afterEach(() => {
    sinon.restore();
  });

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

    it('should load tasks', async () => {
      assert.equal(tasks.length > 0, true);
    });

    it('should run a gradle task', async () => {
      const task = tasks.find(task => task.name === 'hello');
      assert.ok(task);
      if (task) {
        await vscode.tasks.executeTask(task);
      } else {
        throw new Error('Task not found');
      }
    });

    it('should run a subproject gradle task', async () => {
      const task = tasks.find(
        task => task.name === 'subproject-example:helloGroovyMultiProject'
      );
      assert.ok(task);
      if (task) {
        await vscode.tasks.executeTask(task);
      } else {
        throw new Error('Task not found');
      }
    });
  });
});
