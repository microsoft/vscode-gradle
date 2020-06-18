import * as util from 'util';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';

import { Output } from '../../../proto/gradle_pb';
import { GradleTaskTreeItem } from '../../../views';
import { RunTaskOpts, Api as ExtensionApi } from '../../../api';
import { COMMAND_REFRESH, COMMAND_RUN_TASK_WITH_ARGS } from '../../../commands';
import { getSuiteName, EXTENSION_NAME } from '../../testUtil';

const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';
const fixturePath = vscode.Uri.file(
  path.resolve(__dirname, '../../../../test-fixtures', fixtureName)
);

describe(getSuiteName('Extension'), () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let extension: vscode.Extension<any> | undefined;

  before(() => {
    extension = vscode.extensions.getExtension(EXTENSION_NAME);
  });

  it('should be present', () => {
    assert.ok(extension);
  });

  it('should be activated', () => {
    assert.ok(extension);
    if (extension) {
      assert.equal(extension.isActive, true);
    }
  });

  describe('Task provider', () => {
    afterEach(() => {
      sinon.restore();
    });

    it('should load gradle tasks', async () => {
      const tasks = await vscode.tasks.fetchTasks({ type: 'gradle' });
      assert.ok(tasks);
      assert.equal(tasks.length > 0, true);
      const helloTask = tasks.find(({ name }) => name === 'hello');
      assert.ok(helloTask);
      assert.equal(
        path.basename(helloTask.definition.projectFolder),
        fixtureName
      );
    });

    it('should refresh gradle tasks when command is executed', async () => {
      assert.ok(extension);
      const treeDataProvider = extension!.exports.getTasksTreeProvider();
      const stub = sinon.stub(treeDataProvider, 'refresh');
      await vscode.commands.executeCommand(COMMAND_REFRESH);
      assert.ok(stub.called);
    });

    it('should run a gradle task', async () => {
      const task = (await vscode.tasks.fetchTasks({ type: 'gradle' })).find(
        ({ name }) => name === 'hello'
      );
      assert.ok(task);
      const loggerAppendSpy = sinon.spy(extension?.exports.logger, 'append');
      const loggerAppendLineSpy = sinon.spy(
        extension?.exports.logger,
        'appendLine'
      );
      await new Promise(async (resolve) => {
        const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
          if (e.execution.task === task) {
            disposable.dispose();
            resolve();
          }
        });
        try {
          await vscode.tasks.executeTask(task);
        } catch (e) {
          console.error('There was an error starting the task:', e.message);
        }
      });
      assert.ok(loggerAppendSpy.calledWith(sinon.match('Hello, World!')));
      assert.ok(
        loggerAppendLineSpy.calledWith(sinon.match('Completed build: hello'))
      );
    });

    it('should run a gradle task with custom args', async () => {
      sinon
        .stub(vscode.window, 'showInputBox')
        .returns(Promise.resolve('-PcustomProp=foo'));

      assert.ok(extension);

      const task = (await vscode.tasks.fetchTasks({ type: 'gradle' })).find(
        ({ name }) => name === 'helloProjectProperty'
      );
      assert.ok(task);
      const spy = sinon.spy(extension.exports.logger, 'append');
      await new Promise(async (resolve) => {
        // eslint-disable-next-line sonarjs/no-identical-functions
        const endDisposable = vscode.tasks.onDidEndTaskProcess((e) => {
          if (e.execution.task.definition.script === task.definition.script) {
            endDisposable.dispose();
            resolve();
          }
        });
        const treeItem = new GradleTaskTreeItem(
          new vscode.TreeItem('parentTreeItem'),
          task,
          task.name,
          '',
          task.definition.description
        );
        await vscode.commands.executeCommand(
          COMMAND_RUN_TASK_WITH_ARGS,
          treeItem
        );
      });
      assert.ok(spy.calledWith(sinon.match('Hello, Project Property!foo')));
    });
  });

  describe('Extension api', () => {
    it('should run a task using the extension api', async () => {
      const api = extension!.exports as ExtensionApi;
      let hasMessage = false;
      const runTaskOpts: RunTaskOpts = {
        projectFolder: fixturePath.fsPath,
        taskName: 'hello',
        showOutputColors: false,
        onOutput: (output: Output): void => {
          const message = new util.TextDecoder('utf-8')
            .decode(output.getOutputBytes_asU8())
            .trim();
          if (message === 'Hello, World!') {
            hasMessage = true;
          }
        },
      };
      await api.runTask(runTaskOpts);
      assert.ok(hasMessage);
    });
  });
});
