import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as assert from 'assert';
import * as path from 'path';
import * as fg from 'fast-glob';

import { Extension } from '../../extension';
import { logger } from '../../logger';
import {
  getSuiteName,
  buildMockExtension,
  buildMockContext,
  buildMockClient,
  buildMockWorkspaceFolder,
  buildMockOutputChannel,
  buildMockTaskDefinition,
  buildMockGradleTask,
  assertWorkspaceTreeItem,
} from '../testUtil';
import { GradleBuild, GradleProject } from '../../proto/gradle_pb';
import {
  PinnedTasksTreeDataProvider,
  NoPinnedTasksTreeItem,
  GradleTasksTreeDataProvider,
  GradleTaskTreeItem,
  ProjectTreeItem,
  GroupTreeItem,
} from '../../views';
import { PinnedTasksStore } from '../../stores';
import { GradleTaskProvider } from '../../tasks';
import { IconPath, Icons } from '../../icons';
import { ICON_WARNING, ICON_GRADLE_TASK } from '../../views/constants';
import { pinTaskCommand, pinTaskWithArgsCommand } from '../../commands';

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

describe(getSuiteName('Pinned tasks'), () => {
  beforeEach(() => {
    const icons = new Icons(mockContext);
    const gradleTasksTreeDataProvider = new GradleTasksTreeDataProvider(
      mockContext
    );
    const gradleTaskProvder = new GradleTaskProvider();
    const pinnedTasksStore = new PinnedTasksStore(mockContext);
    const pinnedTasksTreeDataProvider = new PinnedTasksTreeDataProvider(
      mockContext,
      pinnedTasksStore
    );
    const mockClient = buildMockClient();
    mockClient.getBuild.resolves(mockGradleBuild);
    mockExtension.getClient.returns(mockClient);
    mockExtension.getPinnedTasksTreeDataProvider.returns(
      pinnedTasksTreeDataProvider
    );
    mockExtension.getGradleTaskProvider.returns(gradleTaskProvder);
    mockExtension.getPinnedTasksStore.returns(pinnedTasksStore);
    mockExtension.getGradleTasksTreeDataProvider.returns(
      gradleTasksTreeDataProvider
    );
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

    describe('With no pinned tasks', () => {
      it('should build a "No Tasks" tree item when no pinned have been added', async () => {
        const children = await mockExtension
          .getPinnedTasksTreeDataProvider()
          .getChildren();
        assert.equal(children.length, 1);
        const childTreeItem = children[0];
        assert.ok(
          childTreeItem instanceof NoPinnedTasksTreeItem,
          'Tree item is not an instance of NoPinnedTasksTreeItem'
        );
        assert.equal(childTreeItem.contextValue, 'notasks');
        assert.equal(childTreeItem.label, 'No pinned tasks');
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

    describe('With pinned tasks', () => {
      let gradleTasks: GradleTaskTreeItem[] = [];
      beforeEach(async () => {
        const gradleTaskTreeDataProvider = mockExtension.getGradleTasksTreeDataProvider() as GradleTasksTreeDataProvider;
        const gradleProjects = await gradleTaskTreeDataProvider.getChildren();
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
          'Task is not a GradleTaskTreeItem'
        );
        pinTaskCommand(taskItem);
        const children = await mockExtension
          .getPinnedTasksTreeDataProvider()
          .getChildren();
        assert.equal(children.length, 1);
        const pinnedTaskTreeItem = children[0];
        assert.equal(
          pinnedTaskTreeItem.collapsibleState,
          vscode.TreeItemCollapsibleState.None
        );
        assert.equal(pinnedTaskTreeItem.contextValue, 'task');
        assert.equal(pinnedTaskTreeItem.description, '');
        assert.equal(pinnedTaskTreeItem.label, mockTaskDefinition1.script);
        assert.equal(
          pinnedTaskTreeItem.tooltip,
          mockTaskDefinition1.description
        );
        assert.equal(
          pinnedTaskTreeItem.task.definition.id,
          mockTaskDefinition1.id
        );
        const iconPath = pinnedTaskTreeItem.iconPath as IconPath;
        assert.equal(
          iconPath.dark,
          path.join('resources', 'dark', ICON_GRADLE_TASK)
        );
        assert.equal(
          iconPath.light,
          path.join('resources', 'light', ICON_GRADLE_TASK)
        );

        const workspaceTreeItem = pinnedTaskTreeItem.parentTreeItem;
        assertWorkspaceTreeItem(workspaceTreeItem, mockWorkspaceFolder1);
      });

      it('should build a pinned task treeitem with args', async () => {
        const taskItem = gradleTasks[0];
        assert.ok(
          taskItem instanceof GradleTaskTreeItem,
          'Task is not a GradleTaskTreeItem'
        );
        sinon.stub(vscode.window, 'showInputBox').resolves('--info '); // intentional trailing space
        await pinTaskWithArgsCommand(taskItem);
        const children = await mockExtension
          .getPinnedTasksTreeDataProvider()
          .getChildren();
        assert.equal(children.length, 1);
        const pinnedTaskTreeItem = children[0];
        assert.equal(
          pinnedTaskTreeItem.collapsibleState,
          vscode.TreeItemCollapsibleState.None
        );
        assert.equal(pinnedTaskTreeItem.contextValue, 'taskWithArgs');
        assert.equal(pinnedTaskTreeItem.description, '');
        assert.equal(
          pinnedTaskTreeItem.label,
          `${mockTaskDefinition1.script} --info`
        );
        assert.equal(
          pinnedTaskTreeItem.tooltip,
          `(args: --info) ${mockTaskDefinition1.description}`
        );
        assert.equal(
          pinnedTaskTreeItem.task.definition.id,
          mockTaskDefinition1.id
        );
        const iconPath = pinnedTaskTreeItem.iconPath as IconPath;
        assert.equal(
          iconPath.dark,
          path.join('resources', 'dark', ICON_GRADLE_TASK)
        );
        assert.equal(
          iconPath.light,
          path.join('resources', 'light', ICON_GRADLE_TASK)
        );

        const workspaceTreeItem = pinnedTaskTreeItem.parentTreeItem;
        assertWorkspaceTreeItem(workspaceTreeItem, mockWorkspaceFolder1);
      });
    });
  });
});
