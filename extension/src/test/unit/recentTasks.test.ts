import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as assert from 'assert';
import * as fg from 'fast-glob';

import { Extension } from '../../extension';
import { logger } from '../../logger';
import {
  getSuiteName,
  buildMockTerminal,
  buildMockExtension,
  buildMockContext,
  buildMockClient,
  buildMockWorkspaceFolder,
  buildMockOutputChannel,
  buildMockTaskDefinition,
  buildMockGradleTask,
  assertFolderTreeItem,
} from '../testUtil';
import {
  RecentTasksTreeDataProvider,
  NoRecentTasksTreeItem,
  RecentTaskTreeItem,
  RecentTasksWorkspaceTreeItem,
} from '../../views';
import { GradleTaskProvider } from '../../tasks';
import { RecentTasksStore, TaskTerminalsStore } from '../../stores';
import { GradleBuild, GradleProject } from '../../proto/gradle_pb';
import { IconPath, Icons } from '../../icons';
import {
  ICON_WARNING,
  ICON_GRADLE_TASK,
  TREE_ITEM_STATE_NO_TASKS,
  TREE_ITEM_STATE_FOLDER,
  TREE_ITEM_STATE_TASK_IDLE,
} from '../../views/constants';
import {
  clearAllRecentTasksCommand,
  closeAllTaskTerminalsCommand,
  showTaskTerminalCommand,
  closeTaskTerminalsCommand,
} from '../../commands';
import { SinonStub } from 'sinon';

const mockContext = buildMockContext();
const mockExtension = buildMockExtension();

const mockWorkspaceFolder1 = buildMockWorkspaceFolder(
  0,
  'folder1',
  'folder name 1'
);

const mockWorkspaceFolder2 = buildMockWorkspaceFolder(
  1,
  'folder2',
  'folder name 2'
);

const mockTaskDefinition1 = buildMockTaskDefinition(
  mockWorkspaceFolder1,
  'assemble1',
  'Description 1'
);

const mockTaskDefinition2 = buildMockTaskDefinition(
  mockWorkspaceFolder2,
  'assemble2',
  'Description 2',
  '--info'
);

const mockGradleTask1 = buildMockGradleTask(mockTaskDefinition1);
const mockGradleTask2 = buildMockGradleTask(mockTaskDefinition2);

const mockGradleProject = new GradleProject();
mockGradleProject.setIsRoot(true);
mockGradleProject.setTasksList([mockGradleTask1, mockGradleTask2]);
const mockGradleBuild = new GradleBuild();
mockGradleBuild.setProject(mockGradleProject);

describe(getSuiteName('Recent tasks'), () => {
  beforeEach(() => {
    const icons = new Icons(mockContext);
    const gradleTaskProvider = new GradleTaskProvider();
    const recentTasksStore = new RecentTasksStore();
    const taskTerminalsStore = new TaskTerminalsStore();
    const recentTasksTreeDataProvider = new RecentTasksTreeDataProvider(
      mockContext,
      recentTasksStore,
      taskTerminalsStore
    );
    const mockClient = buildMockClient();
    mockClient.getBuild.resolves(mockGradleBuild);
    mockExtension.getClient.returns(mockClient);
    mockExtension.getRecentTasksTreeDataProvider.returns(
      recentTasksTreeDataProvider
    );
    mockExtension.getRecentTasksStore.returns(recentTasksStore);
    mockExtension.getGradleTaskProvider.returns(gradleTaskProvider);
    mockExtension.getTaskTerminalsStore.returns(taskTerminalsStore);
    mockExtension.getIcons.returns(icons);

    sinon.stub(Extension, 'getInstance').returns(mockExtension);
    sinon.stub(fg, 'sync').returns([mockTaskDefinition1.buildFile]);
    logger.reset();
    logger.setLoggingChannel(buildMockOutputChannel());
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Without a multi-root workspace', () => {
    beforeEach(() => {
      sinon
        .stub(vscode.workspace, 'workspaceFolders')
        .value([mockWorkspaceFolder1]);
      mockExtension.getGradleTaskProvider().loadTasks();
    });

    describe('With no recent tasks', () => {
      it('should build a "No Tasks" tree item when no recent tasks have been run', async () => {
        const children = await mockExtension
          .getRecentTasksTreeDataProvider()
          .getChildren();
        assert.equal(children.length, 1);
        const childTreeItem = children[0];
        assert.ok(
          childTreeItem instanceof NoRecentTasksTreeItem,
          'Tree item is not an instance of NoRecentTasksTreeItem'
        );
        assert.equal(childTreeItem.contextValue, TREE_ITEM_STATE_NO_TASKS);
        assert.equal(childTreeItem.label, 'No recent tasks');
        const iconPath = childTreeItem.iconPath as IconPath;
        assert.equal(
          iconPath.dark,
          path.join('resources', 'dark', ICON_WARNING)
        );
        assert.equal(
          iconPath.light,
          path.join('resources', 'light', ICON_WARNING)
        );
      });
    });

    describe('With recent tasks', () => {
      beforeEach(() => {
        const recentTasksStore = mockExtension.getRecentTasksStore() as RecentTasksStore;
        recentTasksStore.addEntry(
          mockTaskDefinition1.id,
          mockTaskDefinition1.args
        );
      });

      it('should build a recent task treeitem with no terminals', async () => {
        const children = await mockExtension
          .getRecentTasksTreeDataProvider()
          .getChildren();
        assert.equal(children.length, 1);
        const recentTaskTreeItem = children[0];
        assert.equal(
          recentTaskTreeItem.collapsibleState,
          vscode.TreeItemCollapsibleState.None
        );
        assert.equal(
          recentTaskTreeItem.contextValue,
          TREE_ITEM_STATE_TASK_IDLE
        );
        assert.equal(recentTaskTreeItem.description, '(0)');
        assert.equal(recentTaskTreeItem.label, mockTaskDefinition1.script);
        assert.equal(
          recentTaskTreeItem.tooltip,
          mockTaskDefinition1.description
        );
        assert.equal(
          recentTaskTreeItem.task.definition.id,
          mockTaskDefinition1.id
        );
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
        assert.equal(workspaceTreeItem.contextValue, TREE_ITEM_STATE_FOLDER);
        assert.equal(workspaceTreeItem.label, mockWorkspaceFolder1.name);
        assert.equal(workspaceTreeItem.iconPath.id, 'folder');
        assert.equal(workspaceTreeItem.parentTreeItem, undefined);
        assert.equal(workspaceTreeItem.resourceUri, undefined);
        assert.equal(workspaceTreeItem.tasks.length, 1);
      });

      it('should build a recent task treeitem with a corresponding terminal', async () => {
        const taskTerminalsStore = mockExtension.getTaskTerminalsStore() as TaskTerminalsStore;
        const mockTerminal = buildMockTerminal();
        taskTerminalsStore.addEntry(
          mockTaskDefinition1.id + mockTaskDefinition1.args,
          mockTerminal
        );

        const children = await mockExtension
          .getRecentTasksTreeDataProvider()
          .getChildren();
        assert.equal(children.length, 1);
        const recentTaskTreeItem = children[0] as RecentTaskTreeItem;
        assert.equal(
          recentTaskTreeItem.collapsibleState,
          vscode.TreeItemCollapsibleState.None
        );
        assert.equal(
          recentTaskTreeItem.contextValue,
          TREE_ITEM_STATE_TASK_IDLE + 'WithTerminals'
        );
        assert.equal(recentTaskTreeItem.description, '(1)');
        assert.equal(recentTaskTreeItem.label, mockTaskDefinition1.script);
        assert.equal(
          recentTaskTreeItem.tooltip,
          mockTaskDefinition1.description
        );
        assert.equal(
          recentTaskTreeItem.task.definition.id,
          mockTaskDefinition1.id
        );

        const iconPath = recentTaskTreeItem.iconPath as IconPath;
        assert.equal(
          iconPath.dark,
          path.join('resources', 'dark', ICON_GRADLE_TASK)
        );
        assert.equal(
          iconPath.light,
          path.join('resources', 'light', ICON_GRADLE_TASK)
        );

        const workspaceTreeItem = recentTaskTreeItem.parentTreeItem as RecentTasksWorkspaceTreeItem;
        assert.ok(
          workspaceTreeItem instanceof RecentTasksWorkspaceTreeItem,
          'Tree item is not RecentTasksWorkspaceTreeItem'
        );
        assertFolderTreeItem(workspaceTreeItem, mockWorkspaceFolder1);
        assert.ok(workspaceTreeItem.tasks.length);
      });

      it('should clear all recent tasks', async () => {
        const childrenBefore = await mockExtension
          .getRecentTasksTreeDataProvider()
          .getChildren();
        assert.equal(childrenBefore.length, 1);
        assert.ok(
          childrenBefore[0] instanceof RecentTaskTreeItem,
          // eslint-disable-next-line sonarjs/no-duplicate-string
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
    });
  });

  describe('With multi-root workspace', () => {
    beforeEach(() => {
      sinon
        .stub(vscode.workspace, 'workspaceFolders')
        .value([mockWorkspaceFolder1, mockWorkspaceFolder2]);
      const recentTasksStore = mockExtension.getRecentTasksStore() as RecentTasksStore;
      recentTasksStore.addEntry(
        mockTaskDefinition1.id,
        mockTaskDefinition1.args
      );
      recentTasksStore.addEntry(
        mockTaskDefinition2.id,
        mockTaskDefinition2.args
      );
      mockExtension.getGradleTaskProvider().loadTasks();
    });

    it('should build nested recent task treeitems in a multi-root workspace', async () => {
      const children = await mockExtension
        .getRecentTasksTreeDataProvider()
        .getChildren();
      assert.equal(children.length, 2);
      const workspaceTreeItem1 = children[0];
      assert.equal(
        workspaceTreeItem1.collapsibleState,
        vscode.TreeItemCollapsibleState.Expanded
      );
      assertFolderTreeItem(workspaceTreeItem1, mockWorkspaceFolder1);

      const workspaceTask1 = workspaceTreeItem1.tasks[0];
      assert.equal(workspaceTask1.contextValue, TREE_ITEM_STATE_TASK_IDLE);
      assert.equal(workspaceTask1.description, '(0)');
      assert.equal(workspaceTask1.label, mockTaskDefinition1.script);
      assert.equal(workspaceTask1.task.definition.id, mockTaskDefinition1.id);

      const workspaceTreeItem2 = children[1];
      assert.equal(
        workspaceTreeItem2.collapsibleState,
        vscode.TreeItemCollapsibleState.Expanded
      );
      assertFolderTreeItem(workspaceTreeItem2, mockWorkspaceFolder2);

      const workspaceTask2 = workspaceTreeItem2.tasks[0];
      assert.equal(
        workspaceTask2.contextValue,
        TREE_ITEM_STATE_TASK_IDLE + 'WithArgs'
      );
      assert.equal(workspaceTask2.description, '(0)');
      assert.equal(
        workspaceTask2.label,
        mockTaskDefinition2.script + ' ' + mockTaskDefinition2.args
      );
      assert.equal(workspaceTask2.task.definition.id, mockTaskDefinition2.id);
    });
  });

  describe('Task terminals', () => {
    const mockTerminal1 = buildMockTerminal();
    const mockTerminal2 = buildMockTerminal();
    beforeEach(() => {
      sinon
        .stub(vscode.workspace, 'workspaceFolders')
        .value([mockWorkspaceFolder1]);
      mockExtension.getGradleTaskProvider().loadTasks();
      const recentTasksStore = mockExtension.getRecentTasksStore() as RecentTasksStore;
      recentTasksStore.addEntry(
        mockTaskDefinition1.id,
        mockTaskDefinition1.args
      );
      const taskTerminalsStore = mockExtension.getTaskTerminalsStore() as TaskTerminalsStore;
      taskTerminalsStore.addEntry(
        mockTaskDefinition1.id + mockTaskDefinition1.args,
        mockTerminal1
      );
      taskTerminalsStore.addEntry(
        mockTaskDefinition1.id + mockTaskDefinition1.args,
        mockTerminal2
      );
    });

    it('should close all recent task terminals', async () => {
      const childrenBefore = await mockExtension
        .getRecentTasksTreeDataProvider()
        .getChildren();
      assert.equal(childrenBefore.length, 1);
      const recentTaskTreeItemBefore = childrenBefore[0];
      assert.ok(
        recentTaskTreeItemBefore instanceof RecentTaskTreeItem,
        'Task is not a RecentTaskTreeItem'
      );
      assert.equal(
        recentTaskTreeItemBefore.contextValue,
        TREE_ITEM_STATE_TASK_IDLE + 'WithTerminals'
      );
      assert.equal(recentTaskTreeItemBefore.description, '(2)');

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
      assert.equal(
        recentTaskTreeItemBeforeAfter.contextValue,
        TREE_ITEM_STATE_TASK_IDLE
      );
      assert.equal(recentTaskTreeItemBeforeAfter.description, '(0)');
    });

    it('should show a recent task terminal', async () => {
      const children = await mockExtension
        .getRecentTasksTreeDataProvider()
        .getChildren();
      const treeItem = children[0];
      showTaskTerminalCommand(treeItem);
      assert.ok(
        !mockTerminal1.show.called,
        'Previous task terminal was called'
      );
      assert.ok(
        mockTerminal2.show.called,
        'Latest task terminal was not called'
      );
    });

    it('should close a recent task terminal', async () => {
      const children = await mockExtension
        .getRecentTasksTreeDataProvider()
        .getChildren();
      const treeItem = children[0];
      closeTaskTerminalsCommand(treeItem);
      assert.ok(
        mockTerminal1.dispose.called,
        'Previous task terminal was not called'
      );
      assert.ok(
        mockTerminal2.dispose.called,
        'Latest task terminal was not called'
      );
    });
  });
});
