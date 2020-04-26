import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

import { waitForTasksToLoad } from '../testUtil';

const extensionName = 'richardwillis.vscode-gradle';
const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';

describe(fixtureName, () => {
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
    assert.equal(extension!.isActive, true);
  });

  describe('tasks', () => {
    let tasks: vscode.Task[] | undefined;

    beforeEach(async () => {
      tasks = await waitForTasksToLoad(extensionName);
    });

    it('should load tasks', async () => {
      assert.equal(tasks!.length > 0, true);
    });

    it('should run a gradle task', async () => {
      assert.ok(extension);
      const task = tasks!.find(({ name }) => name === 'hello');
      assert.ok(task);
      const spy = sinon.spy(extension!.exports.logger, 'info');
      await new Promise((resolve) => {
        vscode.tasks.onDidEndTaskProcess((e) => {
          if (e.execution.task === task) {
            resolve();
          }
        });
        vscode.tasks.executeTask(task!);
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
      const spy = sinon.spy(extension!.exports.logger, 'info');
      // eslint-disable-next-line sonarjs/no-identical-functions
      await new Promise((resolve) => {
        // eslint-disable-next-line sonarjs/no-identical-functions
        vscode.tasks.onDidEndTaskProcess((e) => {
          if (e.execution.task === task) {
            resolve();
          }
        });
        vscode.tasks.executeTask(task!);
      });
      assert.ok(spy.calledWith(sinon.match('Hello, World! SubSubProject')));
    });
  });
});
