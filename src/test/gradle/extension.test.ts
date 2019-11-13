import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

import { getGradleWrapperCommandFromPath } from '../../tasks';

const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';
const fixtureDir = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'test-fixtures',
  fixtureName
);

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

    it('should load tasks', () => {
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

    it('should refresh tasks', async () => {
      await vscode.commands.executeCommand('gradle.refresh');
      const task = (
        await vscode.tasks.fetchTasks({ type: 'richardwillis.gradle' })
      ).find(task => task.name === 'hello');
      assert.ok(task);
    });
  });

  describe('logging', () => {
    it('should show command statements in the outputchannel', async () => {
      const extension = vscode.extensions.getExtension(
        'richardwillis.vscode-gradle'
      );
      if (extension) {
        const gradleWrapper = await getGradleWrapperCommandFromPath(fixtureDir);
        const outputChannel = extension.exports.outputChannel;
        sinon.replace(outputChannel, 'append', sinon.fake());
        await vscode.commands.executeCommand('gradle.refresh');
        assert.ok(
          outputChannel.append.calledWith(
            sinon.match(`Executing: ${gradleWrapper} --quiet tasks --all`)
          )
        );
      }
    });
  });
});
