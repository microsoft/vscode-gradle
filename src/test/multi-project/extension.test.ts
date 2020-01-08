import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

import { waitForTasksToLoad } from '../testUtil';
import { logger } from '../../logger';

const extensionName = 'richardwillis.vscode-gradle';
const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';

describe(fixtureName, () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should be present', () => {
    assert.ok(vscode.extensions.getExtension(extensionName));
  });

  it('should be activated', () => {
    const extension = vscode.extensions.getExtension(extensionName);
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
      const extension = vscode.extensions.getExtension(extensionName);
      assert.ok(extension);
      const task = tasks!.find(({ name }) => name === 'hello');
      assert.ok(task);
      const stub = sinon.stub(logger, 'info');
      await new Promise(resolve => {
        vscode.tasks.onDidEndTaskProcess(e => {
          if (e.execution.task === task) {
            resolve();
          }
        });
        vscode.tasks.executeTask(task!);
      });
      assert.ok(stub.calledWith(sinon.match('Hello, World!')));
    });

    it('should run a subproject gradle task', async () => {
      const extension = vscode.extensions.getExtension(extensionName);
      assert.ok(extension);
      const task = tasks!.find(
        ({ definition }) =>
          definition.script ===
          'subproject-example:sub-subproject-example:helloGroovySubSubProject'
      );
      assert.ok(task);
      const stub = sinon.stub(logger, 'info');
      // eslint-disable-next-line sonarjs/no-identical-functions
      await new Promise(resolve => {
        // eslint-disable-next-line sonarjs/no-identical-functions
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
