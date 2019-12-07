import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

import { GradleTaskTreeItem } from '../../gradleView';

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
    it('should load gradle tasks', async () => {
      const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
      assert.equal(tasks.length > 0, true);
      const helloTask = tasks.find(task => task.name === 'hello');
      assert.ok(helloTask);
    });

    it('should refresh gradle tasks when command is executed', async () => {
      const extension = vscode.extensions.getExtension(
        'richardwillis.vscode-gradle'
      );
      const stub = sinon.stub(extension!.exports.treeDataProvider, 'refresh');
      await vscode.commands.executeCommand('gradle.refresh');
      assert.ok(stub.called);
    });

    it('should run a gradle task', async () => {
      const task = (await vscode.tasks.fetchTasks({ type: 'gradle' })).find(
        task => task.name === 'hello'
      );
      assert.ok(task);
      await new Promise(resolve => {
        vscode.tasks.onDidEndTaskProcess(e => {
          if (e.execution.task === task) {
            assert.equal(e.exitCode, 0);
            resolve();
          }
        });
        vscode.tasks.executeTask(task!);
      });
    });

    it('should run a gradle task with custom args', async () => {
      sinon
        .stub(vscode.window, 'showInputBox')
        .returns(Promise.resolve('-PcustomProp=foo'));

      const extension = vscode.extensions.getExtension(
        'richardwillis.vscode-gradle'
      );
      assert.ok(extension);

      const task = (await vscode.tasks.fetchTasks({ type: 'gradle' })).find(
        task => task.name === 'helloProjectProperty'
      );
      assert.ok(task);

      await new Promise(resolve => {
        vscode.tasks.onDidEndTaskProcess(e => {
          if (e.execution.task.definition === task!.definition) {
            assert.equal(e.exitCode, 0);
            resolve();
          }
        });

        const treeItem = new GradleTaskTreeItem(
          extension!.exports.context,
          new vscode.TreeItem('parentTreeItem'),
          task!,
          task!.name,
          task!.definition.description
        );
        vscode.commands.executeCommand('gradle.runTaskWithArgs', treeItem);
      });
    });
  });

  // describe('explorer', () => {});

  describe('logging', () => {
    it('should show command statements in the outputchannel', async () => {
      const extension = vscode.extensions.getExtension(
        'richardwillis.vscode-gradle'
      );
      const outputChannel = extension!.exports.outputChannel;
      sinon.replace(outputChannel, 'appendLine', sinon.fake());
      await vscode.commands.executeCommand('gradle.refresh');
      assert.ok(outputChannel.appendLine.calledWith(sinon.match(/Executing/)));
    });
  });
});
