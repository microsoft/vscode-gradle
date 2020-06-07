/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';

import {
  GetDaemonsStatusReply,
  DaemonInfo,
  StopDaemonReply,
  StopDaemonsReply,
} from '../../proto/gradle_pb';
import {
  GradleDaemonsTreeDataProvider,
  GradleDaemonTreeItem,
} from '../../views';
import { Extension } from '../../extension';
import { SinonStub } from 'sinon';
import {
  stopDaemonCommand,
  COMMAND_REFRESH_DAEMON_STATUS,
  refreshDaemonStatusCommand,
  stopDaemonsCommand,
} from '../../commands';
import { logger } from '../../logger';
import { getSuiteName } from '../testUtil';
import { IconPath } from '../../icons';
import {
  ICON_DAEMON_STOPPED,
  ICON_DAEMON_BUSY,
  ICON_DAEMON_IDLE,
} from '../../views/constants';

const mockContext: any = {
  subscriptions: [],
  asAbsolutePath(relativePath: string) {
    return relativePath;
  },
};

const mockClient = {
  getDaemonsStatus: sinon.stub(),
  stopDaemon: sinon.stub(),
  stopDaemons: sinon.stub(),
};

const mockExtension = {
  getClient: sinon.stub(),
  getGradleDaemonsTreeDataProvider: sinon.stub(),
};

const mockWorkspaceFolder1: vscode.WorkspaceFolder = {
  index: 0,
  uri: vscode.Uri.file('folder1'),
  name: 'folder name 1',
};

const mockWorkspaceFolder2: vscode.WorkspaceFolder = {
  index: 1,
  uri: vscode.Uri.file('folder2'),
  name: 'folder name 2',
};

const mockOutputChannel = {
  name: 'Mock Output Channel',
  append: sinon.spy(),
  appendLine: sinon.spy(),
  clear: sinon.spy(),
  show: sinon.spy(),
  hide: sinon.spy(),
  dispose: sinon.spy(),
};

describe(getSuiteName('Gradle daemons'), () => {
  beforeEach(() => {
    const gradleDaemonsTreeDataProvider = new GradleDaemonsTreeDataProvider(
      mockContext
    );
    mockExtension.getClient.returns(mockClient);
    mockExtension.getGradleDaemonsTreeDataProvider.returns(
      gradleDaemonsTreeDataProvider
    );
    sinon.stub(Extension, 'getInstance').returns(mockExtension as any);
    sinon
      .stub(vscode.workspace, 'workspaceFolders')
      .value([mockWorkspaceFolder1, mockWorkspaceFolder2]);
    logger.reset();
    logger.setLoggingChannel(mockOutputChannel);
  });

  afterEach(() => {
    Object.values(mockOutputChannel).forEach((value: any) => {
      if (value.isSinonProxy) {
        value.resetHistory();
      }
    });
    sinon.restore();
  });

  it('should build the daemon treeitems', async () => {
    const mockReply = new GetDaemonsStatusReply();
    const mockDaemonInfoBusy = new DaemonInfo();
    mockDaemonInfoBusy.setStatus(DaemonInfo.DaemonStatus.BUSY);
    mockDaemonInfoBusy.setPid('41716');
    mockDaemonInfoBusy.setInfo('6.4');

    const mockDaemonInfoIdle = new DaemonInfo();
    mockDaemonInfoIdle.setStatus(DaemonInfo.DaemonStatus.IDLE);
    mockDaemonInfoIdle.setPid('41717');
    mockDaemonInfoIdle.setInfo('6.4');

    const mockDaemonInfoStopped = new DaemonInfo();
    mockDaemonInfoStopped.setStatus(DaemonInfo.DaemonStatus.STOPPED);
    mockDaemonInfoStopped.setPid('41718');
    mockDaemonInfoStopped.setInfo('(by user or operating system)');

    mockReply.setDaemonInfoList([
      mockDaemonInfoBusy,
      mockDaemonInfoIdle,
      mockDaemonInfoStopped,
    ]);

    mockClient.getDaemonsStatus
      .withArgs(mockWorkspaceFolder1.uri.fsPath)
      .resolves(mockReply);
    mockClient.getDaemonsStatus
      .withArgs(mockWorkspaceFolder2.uri.fsPath)
      .resolves(mockReply);

    const children = await mockExtension
      .getGradleDaemonsTreeDataProvider()
      .getChildren();

    assert.equal(children.length, 6);

    const treeItemBusy = children[0];
    assert.equal(treeItemBusy.label, '41716');
    assert.equal(treeItemBusy.description, 'BUSY');
    assert.equal(treeItemBusy.contextValue, 'busy');
    assert.equal(treeItemBusy.tooltip, 'BUSY - 6.4');
    assert.equal(
      treeItemBusy.collapsibleState,
      vscode.TreeItemCollapsibleState.None
    );
    const busyIconPath = treeItemBusy.iconPath as IconPath;
    assert.equal(
      busyIconPath.dark,
      path.join('resources', 'dark', ICON_DAEMON_BUSY)
    );
    assert.equal(
      busyIconPath.light,
      path.join('resources', 'light', ICON_DAEMON_BUSY)
    );

    const treeItemIdle = children[1];
    assert.equal(treeItemIdle.label, '41717');
    assert.equal(treeItemIdle.description, 'IDLE');
    assert.equal(treeItemIdle.contextValue, 'idle');
    assert.equal(treeItemIdle.tooltip, 'IDLE - 6.4');
    assert.equal(
      treeItemIdle.collapsibleState,
      vscode.TreeItemCollapsibleState.None
    );
    const idleIconPath = treeItemIdle.iconPath as IconPath;
    assert.equal(
      idleIconPath.dark,
      path.join('resources', 'dark', ICON_DAEMON_IDLE)
    );
    assert.equal(
      idleIconPath.light,
      path.join('resources', 'light', ICON_DAEMON_IDLE)
    );

    const treeItemStopped = children[2];
    assert.equal(treeItemStopped.label, '41718');
    assert.equal(treeItemStopped.description, 'STOPPED');
    assert.equal(treeItemStopped.contextValue, 'stopped');
    assert.equal(
      treeItemStopped.tooltip,
      'STOPPED - (by user or operating system)'
    );
    assert.equal(
      treeItemStopped.collapsibleState,
      vscode.TreeItemCollapsibleState.None
    );
    const stoppedIconPath = treeItemStopped.iconPath as IconPath;
    assert.equal(
      stoppedIconPath.dark,
      path.join('resources', 'dark', ICON_DAEMON_STOPPED)
    );
    assert.equal(
      stoppedIconPath.light,
      path.join('resources', 'light', ICON_DAEMON_STOPPED)
    );
  });

  it('should stop a daemon', async () => {
    const executeCommandStub = sinon.stub(
      vscode.commands,
      'executeCommand'
    ) as SinonStub;

    const mockReply = new StopDaemonReply();
    mockReply.setMessage('Stopped');
    mockClient.stopDaemon.resolves(mockReply);

    const showWarningMessageStub = (sinon.stub(
      vscode.window,
      'showWarningMessage'
    ) as SinonStub).resolves('Yes');

    const mockDaemonInfoBusy = new DaemonInfo();
    mockDaemonInfoBusy.setStatus(DaemonInfo.DaemonStatus.BUSY);
    mockDaemonInfoBusy.setPid('41716');
    mockDaemonInfoBusy.setInfo('6.4');

    const mockGradleDaemonTreeItem = new GradleDaemonTreeItem(
      mockContext,
      mockDaemonInfoBusy.getPid(),
      mockDaemonInfoBusy
    );

    await stopDaemonCommand(mockGradleDaemonTreeItem);

    assert.ok(
      showWarningMessageStub.calledWith(
        'Are you sure you want to stop the daemon?'
      ),
      'Stop daemon confirmation message not shown'
    );
    assert.equal(showWarningMessageStub.callCount, 1);
    assert.ok(
      mockClient.stopDaemon.calledWith(mockDaemonInfoBusy.getPid()),
      'Client stopDaemon not called with daemon PID'
    );
    assert.equal(mockClient.stopDaemon.callCount, 1);
    assert.ok(
      mockOutputChannel.appendLine.calledWith('[info] Stopped'),
      'Output channel appendLine not called with correct message'
    );
    assert.equal(mockOutputChannel.appendLine.callCount, 1);
    assert.ok(
      executeCommandStub.calledWith(COMMAND_REFRESH_DAEMON_STATUS),
      'Daemon refresh command not called'
    );
    assert.equal(executeCommandStub.callCount, 1);
  });

  it('should stop all daemons', async () => {
    const mockReply1 = new StopDaemonsReply();
    mockReply1.setMessage('Stopped 1');
    const mockReply2 = new StopDaemonsReply();
    mockReply2.setMessage('Stopped 2');

    mockClient.stopDaemons
      .withArgs(mockWorkspaceFolder1.uri.fsPath)
      .resolves(mockReply1);
    mockClient.stopDaemons
      .withArgs(mockWorkspaceFolder2.uri.fsPath)
      .resolves(mockReply2);

    const showWarningMessageStub = (sinon.stub(
      vscode.window,
      'showWarningMessage'
    ) as SinonStub).resolves('Yes');

    const executeCommandStub = sinon.stub(
      vscode.commands,
      'executeCommand'
    ) as SinonStub;

    await stopDaemonsCommand();

    assert.ok(
      showWarningMessageStub.calledWith(
        'Are you sure you want to stop the daemons?'
      ),
      'Stop daemons confirmation message not shown'
    );

    assert.equal(
      mockOutputChannel.appendLine.callCount,
      2,
      'Logger not called expected times'
    );
    assert.ok(
      mockOutputChannel.appendLine.calledWith('[info] Stopped 1'),
      'Reply for folder 1 not logged'
    );
    assert.ok(
      mockOutputChannel.appendLine.calledWith('[info] Stopped 2'),
      'Reply for folder 2 not logged'
    );
    assert.ok(
      executeCommandStub.calledWith(COMMAND_REFRESH_DAEMON_STATUS),
      'Daemon refresh command not called'
    );
    assert.equal(executeCommandStub.callCount, 1);
  });

  it('should refresh the daemons list', () => {
    const gradleDaemonsTreeDataProvider = mockExtension.getGradleDaemonsTreeDataProvider();
    const onDidChangeSpy = sinon.spy();
    gradleDaemonsTreeDataProvider.onDidChangeTreeData(onDidChangeSpy);
    refreshDaemonStatusCommand();
    assert.ok(onDidChangeSpy.calledWith(), 'onDidChangeTreeData not called');
    assert.equal(onDidChangeSpy.callCount, 1);
  });

  it('should prevent queing of daemon status requests', async () => {
    const mockReply1 = new GetDaemonsStatusReply();
    const mockDaemonInfoBusy = new DaemonInfo();
    mockDaemonInfoBusy.setStatus(DaemonInfo.DaemonStatus.BUSY);
    mockDaemonInfoBusy.setPid('41716');
    mockDaemonInfoBusy.setInfo('6.4');
    mockReply1.setDaemonInfoList([mockDaemonInfoBusy]);
    const quickReply = Promise.resolve(mockReply1);

    const mockReply2 = new GetDaemonsStatusReply();
    const mockDaemonInfoIdle = new DaemonInfo();
    mockDaemonInfoIdle.setStatus(DaemonInfo.DaemonStatus.IDLE);
    mockDaemonInfoIdle.setPid('41716');
    mockDaemonInfoIdle.setInfo('6.4 f00');
    mockReply2.setDaemonInfoList([mockDaemonInfoIdle]);
    const longReply = new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockReply2);
      }, 1000);
    });

    const workspaceFolder1: vscode.WorkspaceFolder = {
      index: 0,
      uri: vscode.Uri.file('folder1'),
      name: 'folder name 1',
    };

    sinon.stub(vscode.workspace, 'workspaceFolders').value([workspaceFolder1]);

    mockClient.getDaemonsStatus
      .withArgs(mockWorkspaceFolder1.uri.fsPath)
      .returns(quickReply);

    const gradleDaemonsTreeDataProvider = mockExtension.getGradleDaemonsTreeDataProvider();
    const children = await gradleDaemonsTreeDataProvider.getChildren();

    assert.equal(children[0].description, 'BUSY');

    mockClient.getDaemonsStatus
      .withArgs(mockWorkspaceFolder1.uri.fsPath)
      .returns(longReply);

    await new Promise((resolve, reject) => {
      // This call will return the previous results (quickReply) as we've cancelled
      // the request with the subsequent call to getChildren()
      gradleDaemonsTreeDataProvider
        .getChildren()
        .then((_children: vscode.TreeItem[]) => {
          assert.equal(_children[0].description, 'BUSY');
        })
        .catch(reject);
      // This call will return the correct results (longReply)
      gradleDaemonsTreeDataProvider
        .getChildren()
        .then((_children: vscode.TreeItem[]) => {
          assert.equal(_children[0].description, 'IDLE');
          resolve();
        })
        .catch(reject);
    });
  });
});
