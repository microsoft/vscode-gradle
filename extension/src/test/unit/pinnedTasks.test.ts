import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as path from 'path';

import { logger } from '../../logger';
import {
  getSuiteName,
  buildMockContext,
  buildMockClient,
  buildMockWorkspaceFolder,
  buildMockOutputChannel,
  buildMockTaskDefinition,
  buildMockGradleTask,
  assertFolderTreeItem,
  stubWorkspaceFolders,
} from '../testUtil';
import { GradleBuild, GradleProject } from '../../proto/gradle_pb';
import {
  PinnedTasksTreeDataProvider,
  NoPinnedTasksTreeItem,
  GradleTasksTreeDataProvider,
  GradleTaskTreeItem,
  ProjectTreeItem,
  GroupTreeItem,
  PinnedTaskTreeItem,
  TreeItemWithTasksOrGroups,
  RootProjectTreeItem,
  PinnedTasksRootProjectTreeItem,
} from '../../views';
import { PinnedTasksStore, RootProjectsStore } from '../../stores';
import { GradleTaskProvider } from '../../tasks';
import { IconPath, Icons } from '../../icons';
import {
  ICON_WARNING,
  ICON_GRADLE_TASK,
  TREE_ITEM_STATE_NO_TASKS,
  TREE_ITEM_STATE_FOLDER,
  TREE_ITEM_STATE_TASK_IDLE,
} from '../../views/constants';
import { SinonStub } from 'sinon';
import {
  ClearAllPinnedTasksCommand,
  PinTaskCommand,
  PinTaskWithArgsCommand,
  RemovePinnedTaskCommand,
} from '../../commands';

const mockContext = buildMockContext();

const mockWorkspaceFolder1 = buildMockWorkspaceFolder(0, 'folder1', 'folder1');
const mockWorkspaceFolder2 = buildMockWorkspaceFolder(1, 'folder2', 'folder2');

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

describe(getSuiteName('Pinned tasks'), () => {
  let gradleTasksTreeDataProvider: GradleTasksTreeDataProvider;
  let pinnedTasksTreeDataProvider: PinnedTasksTreeDataProvider;
  let gradleTaskProvider: GradleTaskProvider;
  let pinnedTasksStore: PinnedTasksStore;
  let rootProjectsStore: RootProjectsStore;
  beforeEach(async () => {
    const client = buildMockClient();
    rootProjectsStore = new RootProjectsStore();
    gradleTaskProvider = new GradleTaskProvider(rootProjectsStore, client);
    const icons = new Icons(mockContext);
    gradleTasksTreeDataProvider = new GradleTasksTreeDataProvider(
      mockContext,
      rootProjectsStore,
      gradleTaskProvider,
      icons,
      client
    );
    pinnedTasksStore = new PinnedTasksStore(mockContext);
    pinnedTasksTreeDataProvider = new PinnedTasksTreeDataProvider(
      mockContext,
      pinnedTasksStore,
      rootProjectsStore,
      gradleTaskProvider,
      icons,
      client
    );
    client.getBuild.resolves(mockGradleBuild);
    logger.reset();
    logger.setLoggingChannel(buildMockOutputChannel());
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Without a multi-root workspace', () => {
    beforeEach(async () => {
      stubWorkspaceFolders([mockWorkspaceFolder1]);
      await rootProjectsStore.populate();
      await gradleTaskProvider.loadTasks();
    });

    describe('With no pinned tasks', () => {
      it('should build a "No Tasks" tree item when no pinned have been added', async () => {
        const children = await pinnedTasksTreeDataProvider.getChildren();
        assert.strictEqual(children.length, 1);
        const childTreeItem = children[0];
        assert.ok(
          childTreeItem instanceof NoPinnedTasksTreeItem,
          'Tree item is not an instance of NoPinnedTasksTreeItem'
        );
        assert.strictEqual(
          childTreeItem.contextValue,
          TREE_ITEM_STATE_NO_TASKS
        );
        assert.strictEqual(childTreeItem.label, 'No pinned tasks');
        const iconPath = childTreeItem.iconPath as IconPath;
        assert.strictEqual(
          iconPath.dark,
          path.join('resources', 'dark', ICON_WARNING)
        );
        assert.strictEqual(
          iconPath.light,
          path.join('resources', 'light', ICON_WARNING)
        );
      });
    });

    describe('With pinned tasks', () => {
      let gradleTasks: GradleTaskTreeItem[] = [];
      beforeEach(async () => {
        const gradleProjects = await gradleTasksTreeDataProvider.getChildren();
        assert.ok(gradleProjects.length > 0, 'No gradle projects found');
        assert.ok(
          gradleProjects[0] instanceof ProjectTreeItem,
          'Gradle project is not a ProjectTreeItem'
        );
        const projectItem = gradleProjects[0] as ProjectTreeItem;
        const groupItem = projectItem.groups[0];
        assert.ok(
          groupItem instanceof GroupTreeItem,
          'Group is not a GroupTreeItem'
        );
        gradleTasks = groupItem.tasks;
      });
      it('should build a pinned task treeitem', async () => {
        const taskItem = gradleTasks[0];
        assert.ok(
          taskItem instanceof GradleTaskTreeItem,
          // eslint-disable-next-line sonarjs/no-duplicate-string
          'TreeItem is not a GradleTaskTreeItem'
        );
        await new PinTaskCommand(pinnedTasksTreeDataProvider).run(taskItem);
        const children = await pinnedTasksTreeDataProvider.getChildren();
        assert.strictEqual(children.length, 1);
        const pinnedTaskTreeItem = children[0];
        assert.strictEqual(
          pinnedTaskTreeItem.collapsibleState,
          vscode.TreeItemCollapsibleState.None
        );
        assert.strictEqual(
          pinnedTaskTreeItem.contextValue,
          TREE_ITEM_STATE_TASK_IDLE
        );
        assert.strictEqual(pinnedTaskTreeItem.description, '');
        assert.strictEqual(
          pinnedTaskTreeItem.label,
          mockTaskDefinition1.script
        );
        assert.strictEqual(
          pinnedTaskTreeItem.tooltip,
          mockTaskDefinition1.description
        );
        assert.strictEqual(
          (pinnedTaskTreeItem as PinnedTaskTreeItem).task.definition.id,
          mockTaskDefinition1.id
        );
        const iconPath = pinnedTaskTreeItem.iconPath as IconPath;
        assert.strictEqual(
          iconPath.dark,
          path.join('resources', 'dark', ICON_GRADLE_TASK)
        );
        assert.strictEqual(
          iconPath.light,
          path.join('resources', 'light', ICON_GRADLE_TASK)
        );

        const groupTreeItem = (pinnedTaskTreeItem as PinnedTaskTreeItem)
          .parentTreeItem as TreeItemWithTasksOrGroups;
        assertFolderTreeItem(groupTreeItem, mockWorkspaceFolder1);
        assert.ok(groupTreeItem.tasks.length > 0);
      });

      it('should build a pinned task treeitem with args', async () => {
        const taskItem = gradleTasks[0];
        assert.ok(
          taskItem instanceof GradleTaskTreeItem,
          'TreeItem is not a GradleTaskTreeItem'
        );
        sinon.stub(vscode.window, 'showInputBox').resolves('--info '); // intentional trailing space
        await new PinTaskWithArgsCommand(pinnedTasksTreeDataProvider).run(
          taskItem
        );
        const children = await pinnedTasksTreeDataProvider.getChildren();
        assert.strictEqual(children.length, 1);
        const pinnedTaskTreeItem = children[0];
        assert.strictEqual(
          pinnedTaskTreeItem.collapsibleState,
          vscode.TreeItemCollapsibleState.None
        );
        assert.strictEqual(
          pinnedTaskTreeItem.contextValue,
          TREE_ITEM_STATE_TASK_IDLE + 'WithArgs'
        );
        assert.strictEqual(pinnedTaskTreeItem.description, '');
        assert.strictEqual(
          pinnedTaskTreeItem.label,
          `${mockTaskDefinition1.script} --info`
        );
        assert.strictEqual(
          pinnedTaskTreeItem.tooltip,
          `(args: --info) ${mockTaskDefinition1.description}`
        );
        assert.strictEqual(
          (pinnedTaskTreeItem as PinnedTaskTreeItem).task.definition.id,
          mockTaskDefinition1.id
        );
        const iconPath = pinnedTaskTreeItem.iconPath as IconPath;
        assert.strictEqual(
          iconPath.dark,
          path.join('resources', 'dark', ICON_GRADLE_TASK)
        );
        assert.strictEqual(
          iconPath.light,
          path.join('resources', 'light', ICON_GRADLE_TASK)
        );

        const groupTreeItem = (pinnedTaskTreeItem as PinnedTaskTreeItem)
          .parentTreeItem as TreeItemWithTasksOrGroups;
        assertFolderTreeItem(groupTreeItem, mockWorkspaceFolder1);
        assert.ok(groupTreeItem.tasks.length > 0);
      });

      it('should build a pinned task treeitem with args when pinning an existing pinned task', async () => {
        const taskItem = gradleTasks[0];
        assert.ok(
          taskItem instanceof GradleTaskTreeItem,
          'TreeItem is not a GradleTaskTreeItem'
        );
        await new PinTaskCommand(pinnedTasksTreeDataProvider).run(taskItem);
        const childrenBefore = await pinnedTasksTreeDataProvider.getChildren();
        assert.strictEqual(childrenBefore.length, 1);
        const pinnedTask = childrenBefore[0];
        sinon.stub(vscode.window, 'showInputBox').resolves('--info '); // intentional trailing space
        await new PinTaskWithArgsCommand(pinnedTasksTreeDataProvider).run(
          pinnedTask as PinnedTaskTreeItem
        );

        const childrenAfter = await pinnedTasksTreeDataProvider.getChildren();
        assert.strictEqual(childrenAfter.length, 2);
        assert.ok(
          childrenAfter[0] instanceof PinnedTaskTreeItem,
          // eslint-disable-next-line sonarjs/no-duplicate-string
          'Pinned task is not PinnedTaskTreeItem'
        );
        assert.ok(
          childrenAfter[1] instanceof PinnedTaskTreeItem,
          // eslint-disable-next-line sonarjs/no-duplicate-string
          'Pinned task is not PinnedTaskTreeItem'
        );
        assert.strictEqual(
          (childrenAfter[0] as PinnedTaskTreeItem).task.definition.script,
          (childrenAfter[1] as PinnedTaskTreeItem).task.definition.script
        );
        const pinnedTaskWithArgsTreeItem = childrenAfter[1];
        assert.strictEqual(
          pinnedTaskWithArgsTreeItem.collapsibleState,
          vscode.TreeItemCollapsibleState.None
        );
        assert.strictEqual(
          pinnedTaskWithArgsTreeItem.contextValue,
          TREE_ITEM_STATE_TASK_IDLE + 'WithArgs'
        );
        assert.strictEqual(pinnedTaskWithArgsTreeItem.description, '');
        assert.strictEqual(
          pinnedTaskWithArgsTreeItem.label,
          `${mockTaskDefinition1.script} --info`
        );
        assert.strictEqual(
          pinnedTaskWithArgsTreeItem.tooltip,
          `(args: --info) ${mockTaskDefinition1.description}`
        );
        assert.strictEqual(
          (pinnedTaskWithArgsTreeItem as PinnedTaskTreeItem).task.definition.id,
          mockTaskDefinition1.id
        );
        const groupTreeItem = (pinnedTaskWithArgsTreeItem as PinnedTaskTreeItem)
          .parentTreeItem as TreeItemWithTasksOrGroups;
        assertFolderTreeItem(groupTreeItem, mockWorkspaceFolder1);
        assert.ok(groupTreeItem.tasks.length > 0);
      });

      it('should remove a pinned task', async () => {
        const taskItem = gradleTasks[0];
        await new PinTaskCommand(pinnedTasksTreeDataProvider).run(taskItem);
        const childrenBefore = await pinnedTasksTreeDataProvider.getChildren();
        assert.strictEqual(childrenBefore.length, 1);
        const pinnedTask = childrenBefore[0];
        assert.ok(
          pinnedTask instanceof PinnedTaskTreeItem,
          // eslint-disable-next-line sonarjs/no-duplicate-string
          'Pinned task is not PinnedTaskTreeItem'
        );
        await new RemovePinnedTaskCommand(pinnedTasksTreeDataProvider).run(
          pinnedTask
        );
        const childrenAfter = await pinnedTasksTreeDataProvider.getChildren();
        assert.strictEqual(childrenAfter.length, 1);
        const noPinnedTasks = childrenAfter[0];
        assert.ok(
          noPinnedTasks instanceof NoPinnedTasksTreeItem,
          'Pinned task is not NoPinnedTasksTreeItem'
        );
      });

      it('should remove all pinned tasks', async () => {
        await new PinTaskCommand(pinnedTasksTreeDataProvider).run(
          gradleTasks[0]
        );
        await new PinTaskCommand(pinnedTasksTreeDataProvider).run(
          gradleTasks[1]
        );
        const childrenBefore = await pinnedTasksTreeDataProvider.getChildren();
        assert.strictEqual(childrenBefore.length, 2);
        assert.ok(
          childrenBefore[0] instanceof PinnedTaskTreeItem,
          'Pinned task is not PinnedTaskTreeItem'
        );
        assert.ok(
          childrenBefore[1] instanceof PinnedTaskTreeItem,
          'Pinned task is not PinnedTaskTreeItem'
        );
        const showWarningMessageStub = (sinon.stub(
          vscode.window,
          'showWarningMessage'
        ) as SinonStub).resolves('Yes');
        await new ClearAllPinnedTasksCommand(pinnedTasksStore).run();
        assert.ok(
          showWarningMessageStub.calledWith(
            'Are you sure you want to clear the pinned tasks?'
          ),
          'Clear all pinned tasks confirmation message not shown'
        );
        const childrenAfter = await pinnedTasksTreeDataProvider.getChildren();
        assert.strictEqual(childrenAfter.length, 1);
        const noPinnedTasks = childrenAfter[0];
        assert.ok(
          noPinnedTasks instanceof NoPinnedTasksTreeItem,
          'Pinned task is not NoPinnedTasksTreeItem'
        );
      });
    });
  });

  describe('With a multi-root workspace', () => {
    beforeEach(async () => {
      stubWorkspaceFolders([mockWorkspaceFolder1, mockWorkspaceFolder2]);
      await rootProjectsStore.populate();
      await gradleTaskProvider.loadTasks();
    });

    describe('With pinned tasks', () => {
      it('should build a pinned task treeitem', async () => {
        const workspaceTreeItems = await gradleTasksTreeDataProvider.getChildren();
        assert.ok(workspaceTreeItems.length > 0, 'No gradle projects found');
        const workspaceTreeItem = workspaceTreeItems[0] as RootProjectTreeItem;
        assert.ok(
          workspaceTreeItem instanceof RootProjectTreeItem,
          'Workspace tree item is not a RootProjectTreeItem'
        );
        const projectItem = workspaceTreeItem.projects[0];
        assert.ok(
          projectItem instanceof ProjectTreeItem,
          'Project item is not a ProjectTreeItem'
        );
        const groupItem = projectItem.groups[0];
        assert.ok(
          groupItem instanceof GroupTreeItem,
          'Group is not a GroupTreeItem'
        );
        const taskItem = groupItem.tasks[0];
        assert.ok(
          taskItem instanceof GradleTaskTreeItem,
          'TreeItem is not a GradleTaskTreeItem'
        );
        await new PinTaskCommand(pinnedTasksTreeDataProvider).run(taskItem);
        const children = await pinnedTasksTreeDataProvider.getChildren();
        assert.strictEqual(children.length, 1);
        const pinnedTasksRootProjectTreeItem = children[0] as PinnedTasksRootProjectTreeItem;
        assert.strictEqual(
          pinnedTasksRootProjectTreeItem.collapsibleState,
          vscode.TreeItemCollapsibleState.Expanded
        );
        assert.strictEqual(
          pinnedTasksRootProjectTreeItem.contextValue,
          TREE_ITEM_STATE_FOLDER
        );
        assert.strictEqual(
          pinnedTasksRootProjectTreeItem.label,
          mockWorkspaceFolder1.name
        );
        assert.strictEqual(
          pinnedTasksRootProjectTreeItem.parentTreeItem,
          undefined
        );
        assert.strictEqual(pinnedTasksRootProjectTreeItem.tasks.length, 1);

        const pinnedTaskTreeItem = pinnedTasksRootProjectTreeItem.tasks[0];
        assert.strictEqual(
          pinnedTaskTreeItem.collapsibleState,
          vscode.TreeItemCollapsibleState.None
        );
        assert.strictEqual(
          pinnedTaskTreeItem.contextValue,
          TREE_ITEM_STATE_TASK_IDLE
        );
        assert.strictEqual(pinnedTaskTreeItem.description, '');
        assert.strictEqual(
          pinnedTaskTreeItem.label,
          mockTaskDefinition1.script
        );
        assert.strictEqual(
          pinnedTaskTreeItem.tooltip,
          mockTaskDefinition1.description
        );
        assert.strictEqual(
          (pinnedTaskTreeItem as PinnedTaskTreeItem).task.definition.id,
          mockTaskDefinition1.id
        );
        const iconPath = pinnedTaskTreeItem.iconPath as IconPath;
        assert.strictEqual(
          iconPath.dark,
          path.join('resources', 'dark', ICON_GRADLE_TASK)
        );
        assert.strictEqual(
          iconPath.light,
          path.join('resources', 'light', ICON_GRADLE_TASK)
        );
      });
    });
  });
});
