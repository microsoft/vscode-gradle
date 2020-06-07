/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as assert from 'assert';
import * as fg from 'fast-glob';

import { Extension } from '../../extension';
import { logger } from '../../logger';
import { getSuiteName } from '../testUtil';
import {
  RecentTasksTreeDataProvider,
  NoRecentTasksTreeItem,
  RecentTaskTreeItem,
} from '../../views';
import { GradleTaskDefinition, GradleTaskProvider } from '../../tasks';
import { RecentTasksStore, TaskTerminalsStore } from '../../stores';
import { GradleBuild, GradleProject, GradleTask } from '../../proto/gradle_pb';
import { IconPath, Icons } from '../../icons';
import { ICON_WARNING, ICON_GRADLE_TASK } from '../../views/constants';
import {
  clearAllRecentTasksCommand,
  closeAllTaskTerminalsCommand,
} from '../../commands';
import { SinonStub } from 'sinon';

const mockContext: any = {
  subscriptions: [],
  workspaceState: {
    get: sinon.stub(),
    update: sinon.stub(),
  },
  asAbsolutePath(relativePath: string) {
    return relativePath;
  },
};

const mockClient = {
  getBuild: sinon.stub(),
};

const mockExtension = {
  getClient: sinon.stub(),
  getRecentTasksTreeDataProvider: sinon.stub(),
  getRecentTasksStore: sinon.stub(),
  getGradleTaskProvider: sinon.stub(),
  getTaskTerminalsStore: sinon.stub(),
  getIcons: sinon.stub(),
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

const mockTerminal: vscode.Terminal = {
  name: 'Mock Task Terminal',
  processId: Promise.resolve(0),
  creationOptions: {},
  exitStatus: undefined,
  sendText: sinon.fake(),
  show: sinon.fake(),
  hide: sinon.fake(),
  dispose: sinon.fake(),
};

const mockProjectName = 'dropwizard-project';
const mockTaskDefinition1: GradleTaskDefinition = {
  type: 'gradle',
  id: mockWorkspaceFolder1.uri.fsPath + 'assemble1dropwizard-project',
  script: 'assemble1',
  description: 'Description 1',
  group: 'build',
  project: mockProjectName,
  buildFile: path.join(mockWorkspaceFolder1.uri.fsPath, 'build.gradle'),
  rootProject: mockProjectName,
  projectFolder: mockWorkspaceFolder1.uri.fsPath,
  workspaceFolder: mockWorkspaceFolder1.uri.fsPath,
  args: '',
  javaDebug: false,
};

const mockTaskDefinition2: GradleTaskDefinition = {
  type: 'gradle',
  id: mockWorkspaceFolder2.uri.fsPath + 'assemble2dropwizard-project',
  script: 'assemble2',
  description: 'Desription 2',
  group: 'build',
  project: mockProjectName,
  buildFile: path.join(mockWorkspaceFolder2.uri.fsPath, 'build.gradle'),
  rootProject: mockProjectName,
  projectFolder: mockWorkspaceFolder2.uri.fsPath,
  workspaceFolder: mockWorkspaceFolder2.uri.fsPath,
  args: '--info',
  javaDebug: false,
};

const mockGradleTask1 = new GradleTask();
mockGradleTask1.setBuildfile(mockTaskDefinition1.buildFile);
mockGradleTask1.setName(mockTaskDefinition1.name);
mockGradleTask1.setPath(':' + mockTaskDefinition1.script);
mockGradleTask1.setProject(mockTaskDefinition1.project);
mockGradleTask1.setGroup(mockTaskDefinition1.group);
mockGradleTask1.setRootproject(mockProjectName);
mockGradleTask1.setDescription(mockTaskDefinition1.description);

const mockGradleTask2 = new GradleTask();
mockGradleTask2.setBuildfile(mockTaskDefinition2.buildFile);
mockGradleTask2.setName(mockTaskDefinition2.name);
mockGradleTask2.setPath(':' + mockTaskDefinition2.script);
mockGradleTask2.setProject(mockTaskDefinition2.project);
mockGradleTask2.setGroup(mockTaskDefinition2.group);
mockGradleTask2.setRootproject(mockProjectName);
mockGradleTask2.setDescription(mockTaskDefinition2.description);

const mockGradleProject = new GradleProject();
mockGradleProject.setIsRoot(true);
mockGradleProject.setTasksList([mockGradleTask1, mockGradleTask2]);
const mockGradleBuild = new GradleBuild();
mockGradleBuild.setProject(mockGradleProject);

describe(getSuiteName('Recent tasks'), () => {
  beforeEach(() => {
    const icons = new Icons(mockContext);
    const gradleTaskProvder = new GradleTaskProvider();
    const recentTasksStore = new RecentTasksStore();
    const taskTerminalsStore = new TaskTerminalsStore();
    const recentTasksTreeDataProvider = new RecentTasksTreeDataProvider(
      mockContext,
      recentTasksStore,
      taskTerminalsStore
    );
    mockClient.getBuild.resolves(mockGradleBuild);
    mockExtension.getClient.returns(mockClient);
    mockExtension.getRecentTasksTreeDataProvider.returns(
      recentTasksTreeDataProvider
    );
    mockExtension.getRecentTasksStore.returns(recentTasksStore);
    mockExtension.getGradleTaskProvider.returns(gradleTaskProvder);
    mockExtension.getTaskTerminalsStore.returns(taskTerminalsStore);
    mockExtension.getIcons.returns(icons);
    sinon.stub(Extension, 'getInstance').returns(mockExtension as any);

    sinon.stub(fg, 'sync').returns([mockTaskDefinition1.buildFile]);
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

  it('should build a "No Tasks" tree item when no recent tasks have been run', async () => {
    sinon
      .stub(vscode.workspace, 'workspaceFolders')
      .value([mockWorkspaceFolder1]);
    mockExtension.getGradleTaskProvider().loadTasks();
    const children = await mockExtension
      .getRecentTasksTreeDataProvider()
      .getChildren();
    assert.equal(children.length, 1);
    const childTreeItem = children[0];
    assert.ok(
      childTreeItem instanceof NoRecentTasksTreeItem,
      'Tree item is not an instance of NoRecentTasksTreeItem'
    );
    assert.equal(childTreeItem.contextValue, 'notasks');
    assert.equal(childTreeItem.label, 'No recent tasks');
    const iconPath = childTreeItem.iconPath as IconPath;
    assert.equal(iconPath.dark, path.join('resources', 'dark', ICON_WARNING));
    assert.equal(iconPath.light, path.join('resources', 'light', ICON_WARNING));
  });

  it('should build a recent task treeitem with no terminals', async () => {
    sinon
      .stub(vscode.workspace, 'workspaceFolders')
      .value([mockWorkspaceFolder1]);
    mockExtension.getGradleTaskProvider().loadTasks();
    const recentTasksStore = mockExtension.getRecentTasksStore() as RecentTasksStore;
    recentTasksStore.addEntry(mockTaskDefinition1.id, mockTaskDefinition1.args);
    const children = await mockExtension
      .getRecentTasksTreeDataProvider()
      .getChildren();
    assert.equal(children.length, 1);
    const recentTaskTreeItem = children[0];
    assert.equal(
      recentTaskTreeItem.collapsibleState,
      vscode.TreeItemCollapsibleState.None
    );
    assert.equal(recentTaskTreeItem.contextValue, 'task');
    assert.equal(recentTaskTreeItem.description, '(0)');
    assert.equal(recentTaskTreeItem.label, mockTaskDefinition1.script);
    assert.equal(recentTaskTreeItem.tooltip, mockTaskDefinition1.description);
    assert.equal(recentTaskTreeItem.task.definition.id, mockTaskDefinition1.id);
    const iconPath = recentTaskTreeItem.iconPath as IconPath;
    assert.equal(
      iconPath.dark,
      path.join('resources', 'dark', ICON_GRADLE_TASK)
    );
    assert.equal(
      iconPath.light,
      path.join('resources', 'light', ICON_GRADLE_TASK)
    );

    const workspaceTreeItem = recentTaskTreeItem.parentTreeItem;
    assert.ok(
      workspaceTreeItem,
      'parentTreeItem must reference a WorkSpace tree item'
    );
    assert.equal(workspaceTreeItem.contextValue, 'folder');
    assert.equal(workspaceTreeItem.label, mockWorkspaceFolder1.name);
    assert.equal(workspaceTreeItem.iconPath.id, 'folder');
    assert.equal(workspaceTreeItem.parentTreeItem, undefined);
    assert.equal(workspaceTreeItem.resourceUri, undefined);
    assert.equal(workspaceTreeItem.tasks.length, 1);
  });

  it('should build a recent task treeitem with a corresponding terminal', async () => {
    sinon
      .stub(vscode.workspace, 'workspaceFolders')
      .value([mockWorkspaceFolder1]);
    mockExtension.getGradleTaskProvider().loadTasks();
    const recentTasksStore = mockExtension.getRecentTasksStore() as RecentTasksStore;
    recentTasksStore.addEntry(mockTaskDefinition1.id, mockTaskDefinition1.args);
    const taskTerminalsStore = mockExtension.getTaskTerminalsStore() as TaskTerminalsStore;
    taskTerminalsStore.addEntry(
      mockTaskDefinition1.id + mockTaskDefinition1.args,
      mockTerminal
    );

    const children = await mockExtension
      .getRecentTasksTreeDataProvider()
      .getChildren();
    assert.equal(children.length, 1);
    const recentTaskTreeItem = children[0];
    assert.equal(
      recentTaskTreeItem.collapsibleState,
      vscode.TreeItemCollapsibleState.None
    );
    assert.equal(recentTaskTreeItem.contextValue, 'taskWithTerminals');
    assert.equal(recentTaskTreeItem.description, '(1)');
    assert.equal(recentTaskTreeItem.label, mockTaskDefinition1.script);
    assert.equal(recentTaskTreeItem.tooltip, mockTaskDefinition1.description);
    assert.equal(recentTaskTreeItem.task.definition.id, mockTaskDefinition1.id);

    const iconPath = recentTaskTreeItem.iconPath as IconPath;
    assert.equal(
      iconPath.dark,
      path.join('resources', 'dark', ICON_GRADLE_TASK)
    );
    assert.equal(
      iconPath.light,
      path.join('resources', 'light', ICON_GRADLE_TASK)
    );

    const workspaceTreeItem = recentTaskTreeItem.parentTreeItem;
    assert.ok(
      workspaceTreeItem,
      'parentTreeItem must reference a WorkSpace tree item'
    );
    assert.equal(workspaceTreeItem.contextValue, 'folder');
    assert.equal(workspaceTreeItem.label, mockWorkspaceFolder1.name);
    assert.equal(workspaceTreeItem.iconPath.id, 'folder');
    assert.equal(workspaceTreeItem.parentTreeItem, undefined);
    assert.equal(workspaceTreeItem.resourceUri, undefined);
    assert.equal(workspaceTreeItem.tasks.length, 1);
  });

  it('should build nested recent task treeitems in a multi-root workspace', async () => {
    sinon
      .stub(vscode.workspace, 'workspaceFolders')
      .value([mockWorkspaceFolder1, mockWorkspaceFolder2]);
    mockExtension.getGradleTaskProvider().loadTasks();
    const recentTasksStore = mockExtension.getRecentTasksStore() as RecentTasksStore;
    recentTasksStore.addEntry(mockTaskDefinition1.id, mockTaskDefinition1.args);
    recentTasksStore.addEntry(mockTaskDefinition2.id, mockTaskDefinition2.args);
    const children = await mockExtension
      .getRecentTasksTreeDataProvider()
      .getChildren();
    assert.equal(children.length, 2);
    const workspaceTreeItem1 = children[0];
    assert.equal(
      workspaceTreeItem1.collapsibleState,
      vscode.TreeItemCollapsibleState.Expanded
    );
    assert.equal(workspaceTreeItem1.contextValue, 'folder');
    assert.equal(workspaceTreeItem1.label, mockWorkspaceFolder1.name);
    assert.equal(workspaceTreeItem1.iconPath.id, 'folder');
    assert.equal(workspaceTreeItem1.parentTreeItem, undefined);
    assert.equal(workspaceTreeItem1.resourceUri, undefined);
    assert.equal(workspaceTreeItem1.tasks.length, 1);

    const workspaceTask1 = workspaceTreeItem1.tasks[0];
    assert.equal(workspaceTask1.contextValue, 'task');
    assert.equal(workspaceTask1.description, '(0)');
    assert.equal(workspaceTask1.label, mockTaskDefinition1.script);
    assert.equal(workspaceTask1.task.definition.id, mockTaskDefinition1.id);

    const workspaceTreeItem2 = children[1];
    assert.equal(
      workspaceTreeItem2.collapsibleState,
      vscode.TreeItemCollapsibleState.Expanded
    );
    assert.equal(workspaceTreeItem2.contextValue, 'folder');
    assert.equal(workspaceTreeItem2.label, mockWorkspaceFolder2.name);
    assert.equal(workspaceTreeItem2.iconPath.id, 'folder');
    assert.equal(workspaceTreeItem2.parentTreeItem, undefined);
    assert.equal(workspaceTreeItem2.resourceUri, undefined);
    assert.equal(workspaceTreeItem2.tasks.length, 1);

    const workspaceTask2 = workspaceTreeItem2.tasks[0];
    assert.equal(workspaceTask2.contextValue, 'taskWithArgs');
    assert.equal(workspaceTask2.description, '(0)');
    assert.equal(
      workspaceTask2.label,
      mockTaskDefinition2.script + ' ' + mockTaskDefinition2.args
    );
    assert.equal(workspaceTask2.task.definition.id, mockTaskDefinition2.id);
  });

  it('should clear all recent tasks', async () => {
    sinon
      .stub(vscode.workspace, 'workspaceFolders')
      .value([mockWorkspaceFolder1]);
    mockExtension.getGradleTaskProvider().loadTasks();
    const recentTasksStore = mockExtension.getRecentTasksStore() as RecentTasksStore;
    recentTasksStore.addEntry(mockTaskDefinition1.id, mockTaskDefinition1.args);

    const childrenBefore = await mockExtension
      .getRecentTasksTreeDataProvider()
      .getChildren();
    assert.equal(childrenBefore.length, 1);
    assert.ok(
      childrenBefore[0] instanceof RecentTaskTreeItem,
      'Task is not a RecentTaskTreeItem'
    );

    const showWarningMessageStub = (sinon.stub(
      vscode.window,
      'showWarningMessage'
    ) as SinonStub).resolves('Yes');

    await clearAllRecentTasksCommand();

    assert.ok(
      showWarningMessageStub.calledWith(
        'Are you sure you want to clear the recent tasks?'
      ),
      'Clear all recent tasks confirmation message not shown'
    );
    const childrenAfter = await mockExtension
      .getRecentTasksTreeDataProvider()
      .getChildren();
    assert.equal(childrenAfter.length, 1);
    const childTreeItem = childrenAfter[0];
    assert.ok(
      childTreeItem instanceof NoRecentTasksTreeItem,
      'Tree item is not an instance of NoRecentTasksTreeItem'
    );
  });

  it('should close all recent task terminals', async () => {
    sinon
      .stub(vscode.workspace, 'workspaceFolders')
      .value([mockWorkspaceFolder1]);
    mockExtension.getGradleTaskProvider().loadTasks();
    const recentTasksStore = mockExtension.getRecentTasksStore() as RecentTasksStore;
    recentTasksStore.addEntry(mockTaskDefinition1.id, mockTaskDefinition1.args);
    const taskTerminalsStore = mockExtension.getTaskTerminalsStore() as TaskTerminalsStore;
    taskTerminalsStore.addEntry(
      mockTaskDefinition1.id + mockTaskDefinition1.args,
      mockTerminal
    );
    const childrenBefore = await mockExtension
      .getRecentTasksTreeDataProvider()
      .getChildren();
    assert.equal(childrenBefore.length, 1);
    const recentTaskTreeItemBefore = childrenBefore[0];
    assert.ok(
      recentTaskTreeItemBefore instanceof RecentTaskTreeItem,
      'Task is not a RecentTaskTreeItem'
    );
    assert.equal(recentTaskTreeItemBefore.contextValue, 'taskWithTerminals');
    assert.equal(recentTaskTreeItemBefore.description, '(1)');

    const showWarningMessageStub = (sinon.stub(
      vscode.window,
      'showWarningMessage'
    ) as SinonStub).resolves('Yes');

    await closeAllTaskTerminalsCommand();

    assert.ok(
      showWarningMessageStub.calledWith(
        'Are you sure you want to close all task terminals?'
      ),
      'Close all task terminals confirmation message not shown'
    );

    const childrenAfter = await mockExtension
      .getRecentTasksTreeDataProvider()
      .getChildren();
    assert.equal(childrenAfter.length, 1);
    const recentTaskTreeItemBeforeAfter = childrenAfter[0];
    assert.ok(
      recentTaskTreeItemBeforeAfter instanceof RecentTaskTreeItem,
      'Task is not a RecentTaskTreeItem'
    );
    assert.equal(recentTaskTreeItemBeforeAfter.contextValue, 'task');
    assert.equal(recentTaskTreeItemBeforeAfter.description, '(0)');
  });

  it.skip('should show a recent task terminal', () => {
    // TODO
  });

  it.skip('should close a recent task terminal', () => {
    // TODO
  });
});
