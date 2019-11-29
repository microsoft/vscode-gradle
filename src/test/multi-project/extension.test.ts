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
    assert.equal(extension!.isActive, true);
  });

  describe('tasks', () => {
    let tasks: vscode.Task[];

    beforeEach(async () => {
      tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
    });

    it('should load tasks', async () => {
      assert.equal(tasks.length > 0, true);
    });

    it('should run a gradle task', async () => {
      const task = tasks.find(task => task.name === 'hello');
      assert.ok(task);
      await vscode.tasks.executeTask(task!);
    });

    it('should run a subproject gradle task', done => {
      const task = tasks.find(
        task =>
          task.definition.script ===
          'subproject-example:sub-subproject-example:helloGroovySubSubProject'
      );
      assert.ok(task);
      vscode.tasks.onDidEndTaskProcess(e => {
        if (e.execution.task === task) {
          done(e.exitCode === 0 ? undefined : 'Process error');
        }
      });
      vscode.tasks.executeTask(task!);
    });
  });
});
