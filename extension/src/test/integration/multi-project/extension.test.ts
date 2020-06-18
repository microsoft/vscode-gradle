import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

const extensionName = 'richardwillis.vscode-gradle';
const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';
const suiteName = process.env.SUITE_NAME || '(unknown suite)';

describe(`${suiteName} - ${fixtureName}`, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let extension: vscode.Extension<any> | undefined;

  before(() => {
    extension = vscode.extensions.getExtension(extensionName);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should be present', () => {
    assert.ok(extension);
  });

  it('should be activated', () => {
    assert.ok(extension);
    assert.equal(extension.isActive, true);
  });

  describe('tasks', () => {
    let tasks: vscode.Task[] | undefined;

    beforeEach(async () => {
      tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
    });

    it('should load tasks', async () => {
      assert.equal(tasks!.length > 0, true);
    });

    it('should run a gradle task', async () => {
      assert.ok(extension);
      const task = tasks!.find(({ name }) => name === 'hello');
      assert.ok(task);
      const spy = sinon.spy(extension.exports.logger, 'append');
      await new Promise(async (resolve) => {
        const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
          if (e.execution.task === task) {
            disposable.dispose();
            resolve();
          }
        });
        try {
          await vscode.tasks.executeTask(task!);
        } catch (e) {
          console.error('There was an error starting the task:', e.message);
        }
      });
      assert.ok(spy.calledWith(sinon.match('Hello, World!')));
    });

    it('should run a subproject gradle task', async () => {
      assert.ok(extension);
      const task = tasks!.find(
        ({ definition }) =>
          definition.script ===
          'subproject-example:sub-subproject-example:helloGroovySubSubProject'
      );
      assert.ok(task);
      const spy = sinon.spy(extension.exports.logger, 'append');
      // eslint-disable-next-line sonarjs/no-identical-functions
      await new Promise(async (resolve) => {
        // eslint-disable-next-line sonarjs/no-identical-functions
        const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
          if (e.execution.task === task) {
            disposable.dispose();
            resolve();
          }
        });
        try {
          await vscode.tasks.executeTask(task!);
        } catch (e) {
          console.error('There was an error starting the task:', e.message);
        }
      });
      assert.ok(spy.calledWith(sinon.match('Hello, World! SubSubProject')));
    });
  });
});
