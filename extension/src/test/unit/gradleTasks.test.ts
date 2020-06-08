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
} from '../testUtil';
import { GradleBuild, GradleProject } from '../../proto/gradle_pb';
import {
  GradleTasksTreeDataProvider,
  GradleTaskTreeItem,
  ProjectTreeItem,
  GroupTreeItem,
  NoGradleTasksTreeItem,
  WorkspaceTreeItem,
} from '../../views';
import { GradleTaskProvider } from '../../tasks';
import { IconPath, Icons } from '../../icons';
import {
  ICON_WARNING,
  ICON_GRADLE_TASK,
  ICON_LOADING,
  TREE_ITEM_STATE_NO_TASKS,
  TREE_ITEM_STATE_TASK_RUNNING,
  TREE_ITEM_STATE_FOLDER,
  TREE_ITEM_STATE_TASK_IDLE,
  TREE_ITEM_STATE_TASK_CANCELLING,
} from '../../views/constants';
import {
  COMMAND_SHOW_LOGS,
  explorerFlatCommand,
  explorerTreeCommand,
  cancelTaskCommand,
  COMMAND_RENDER_TASK,
} from '../../commands';
import { removeCancellingTask } from '../../tasks/taskUtil';

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

const mockTaskDefinition1ForFolder1 = buildMockTaskDefinition(
  mockWorkspaceFolder1,
  'assemble1',
  'Description 1'
);

const mockTaskDefinition2ForFolder1 = buildMockTaskDefinition(
  mockWorkspaceFolder1,
  'assemble1',
  'Description 1'
);

// const mockTaskDefinition2 = buildMockTaskDefinition(
//   mockWorkspaceFolder1,
//   'assemble2',
//   'Description 2',
//   '--info'
// );

const mockGradleTask1 = buildMockGradleTask(mockTaskDefinition1ForFolder1);
const mockGradleTask2 = buildMockGradleTask(mockTaskDefinition2ForFolder1);

const mockGradleProjectWithTasks = new GradleProject();
mockGradleProjectWithTasks.setIsRoot(true);
mockGradleProjectWithTasks.setTasksList([mockGradleTask1, mockGradleTask2]);
const mockGradleBuildWithTasks = new GradleBuild();
mockGradleBuildWithTasks.setProject(mockGradleProjectWithTasks);

const mockGradleProjectWithoutTasks = new GradleProject();
mockGradleProjectWithoutTasks.setIsRoot(true);
const mockGradleBuildWithoutTasks = new GradleBuild();
mockGradleBuildWithoutTasks.setProject(mockGradleProjectWithoutTasks);

describe(getSuiteName('Gradle tasks'), () => {
  beforeEach(() => {
    const icons = new Icons(mockContext);
    const gradleTasksTreeDataProvider = new GradleTasksTreeDataProvider(
      mockContext
    );
    const gradleTaskProvider = new GradleTaskProvider();
    const mockClient = buildMockClient();
    mockExtension.getClient.returns(mockClient);
    mockExtension.getGradleTaskProvider.returns(gradleTaskProvider);
    mockExtension.getGradleTasksTreeDataProvider.returns(
      gradleTasksTreeDataProvider
    );
    mockExtension.getIcons.returns(icons);
    sinon.stub(Extension, 'getInstance').returns(mockExtension);
    sinon.stub(fg, 'sync').returns([mockTaskDefinition1ForFolder1.buildFile]);
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
    });

    describe('With no gradle tasks', () => {
      it('should build a "No Tasks" tree item when no tasks are found', async () => {
        mockExtension
          .getClient()
          .getBuild.resolves(mockGradleBuildWithoutTasks);
        const children = await mockExtension
          .getGradleTasksTreeDataProvider()
          .getChildren();
        assert.equal(children.length, 1);
        const noTasksTreeItem = children[0];
        assert.ok(
          noTasksTreeItem instanceof NoGradleTasksTreeItem,
          'Tree item is not an instance of NoGradleTasksTreeItem'
        );
        assert.equal(noTasksTreeItem.contextValue, TREE_ITEM_STATE_NO_TASKS);
        assert.equal(noTasksTreeItem.label, 'No tasks found');
        const iconPath = noTasksTreeItem.iconPath as IconPath;
        assert.equal(
          iconPath.dark,
          path.join('resources', 'dark', ICON_WARNING)
        );
        assert.equal(
          iconPath.light,
          path.join('resources', 'light', ICON_WARNING)
        );
        assert.ok(
          noTasksTreeItem.command,
          'NoGradleTasksTreeItem should have a command'
        );
        assert.equal(noTasksTreeItem.command.command, COMMAND_SHOW_LOGS);
        assert.equal(noTasksTreeItem.command.title, 'Show Logs');
      });
    });

    describe('With gradle tasks', () => {
      beforeEach(async () => {
        mockExtension.getClient().getBuild.resolves(mockGradleBuildWithTasks);
      });

      describe('Expanded tree', () => {
        let gradleProjects: vscode.TreeItem[] = [];
        beforeEach(async () => {
          explorerTreeCommand();
          const gradleTaskTreeDataProvider = mockExtension.getGradleTasksTreeDataProvider() as GradleTasksTreeDataProvider;
          gradleProjects = await gradleTaskTreeDataProvider.getChildren();
        });

        it('should build project items at top level', () => {
          assert.ok(gradleProjects.length > 0, 'No gradle projects found');
          assert.equal(
            gradleProjects.length,
            1,
            'There should only be one project if two tasks share the same project & buildfile'
          );
          const projectItem = gradleProjects[0] as ProjectTreeItem;
          assert.ok(
            projectItem instanceof ProjectTreeItem,
            'Gradle project is not a ProjectTreeItem'
          );
          assert.equal(
            projectItem.groups.length,
            1,
            'There should only be one group if there are multiple tasks that share the same group'
          );
          assert.equal(
            projectItem.collapsibleState,
            vscode.TreeItemCollapsibleState.Expanded
          );
          assert.equal(projectItem.contextValue, TREE_ITEM_STATE_FOLDER);
          assert.equal(
            projectItem.label,
            mockTaskDefinition1ForFolder1.project
          );
          assert.ok(
            projectItem.parentTreeItem instanceof WorkspaceTreeItem,
            'parentTreeItem must be a WorkspaceTreeItem'
          );
          assert.ok(
            projectItem.resourceUri,
            'resourceUri must be set for a ProjectTreeItem'
          );
          assert.equal(
            projectItem.resourceUri.fsPath,
            mockTaskDefinition1ForFolder1.buildFile
          );
          assert.equal(
            projectItem.resourceUri.path,
            mockTaskDefinition1ForFolder1.buildFile
          );
          assert.equal(projectItem.iconPath, vscode.ThemeIcon.File);
          assert.equal(
            projectItem.tasks.length,
            0,
            'There should not be any tasks for a ProjectTreeItem if the tree is not collapsed'
          );
        });

        it('should build task group items', () => {
          const projectItem = gradleProjects[0] as ProjectTreeItem;
          const groupItem = projectItem.groups[0];
          assert.ok(
            groupItem instanceof GroupTreeItem,
            'Group is not a GroupTreeItem'
          );
          assert.equal(groupItem.contextValue, TREE_ITEM_STATE_FOLDER);
          assert.equal(
            groupItem.collapsibleState,
            vscode.TreeItemCollapsibleState.Collapsed
          );
          assert.equal(groupItem.label, mockTaskDefinition1ForFolder1.group);
          assert.equal(groupItem.iconPath, vscode.ThemeIcon.Folder);
          assert.equal(
            groupItem.parentTreeItem,
            projectItem,
            'GroupTreeItem parentItem must be ProjectTreeItem'
          );
          assert.equal(groupItem.tasks.length, 2);
        });

        it('should build task items', () => {
          const projectItem = gradleProjects[0] as ProjectTreeItem;
          const groupItem = projectItem.groups[0] as GroupTreeItem;
          const gradleTasks = groupItem.tasks;
          const taskItem = gradleTasks[0] as GradleTaskTreeItem;
          assert.ok(
            taskItem instanceof GradleTaskTreeItem,
            // eslint-disable-next-line sonarjs/no-duplicate-string
            'TreeItem is not a GradleTaskTreeItem'
          );
          assert.equal(taskItem.contextValue, TREE_ITEM_STATE_TASK_IDLE);
          assert.equal(taskItem.description, '');
          assert.equal(taskItem.label, mockTaskDefinition1ForFolder1.script);
          assert.equal(
            taskItem.tooltip,
            mockTaskDefinition1ForFolder1.description
          );
          assert.equal(
            taskItem.task.definition.id,
            mockTaskDefinition1ForFolder1.id
          );
          const iconPath = taskItem.iconPath as IconPath;
          assert.equal(
            iconPath.dark,
            path.join('resources', 'dark', ICON_GRADLE_TASK)
          );
          assert.equal(
            iconPath.light,
            path.join('resources', 'light', ICON_GRADLE_TASK)
          );
          assert.equal(taskItem.parentTreeItem, groupItem);
        });
      });

      describe('Collapsed tree', () => {
        let gradleProjects: vscode.TreeItem[] = [];
        beforeEach(async () => {
          explorerFlatCommand();
          const gradleTaskTreeDataProvider = mockExtension.getGradleTasksTreeDataProvider() as GradleTasksTreeDataProvider;
          gradleProjects = await gradleTaskTreeDataProvider.getChildren();
        });

        it('should build project items at top level', () => {
          assert.ok(gradleProjects.length > 0, 'No gradle projects found');
          assert.equal(
            gradleProjects.length,
            1,
            'There should only be one project if two tasks share the same project & buildfile'
          );
          const projectItem = gradleProjects[0] as ProjectTreeItem;
          assert.equal(
            projectItem.collapsibleState,
            vscode.TreeItemCollapsibleState.Expanded
          );
          assert.ok(
            projectItem instanceof ProjectTreeItem,
            'Gradle project is not a ProjectTreeItem'
          );
          assert.ok(
            projectItem.parentTreeItem instanceof WorkspaceTreeItem,
            'parentTreeItem must be a WorkspaceTreeItem'
          );
        });

        it('should build task items', () => {
          const projectItem = gradleProjects[0] as ProjectTreeItem;
          assert.equal(
            projectItem.groups.length,
            0,
            'ProjectTreeItem should not have any groups'
          );
          assert.equal(
            projectItem.tasks.length,
            2,
            'Tasks should be listed under projects'
          );
          assert.ok(
            projectItem.tasks[0] instanceof GradleTaskTreeItem,
            'Tree item should be GradleTaskTreeItem'
          );
          assert.ok(
            projectItem.tasks[1] instanceof GradleTaskTreeItem,
            'Tree item should be GradleTaskTreeItem'
          );
        });
      });

      describe('Task state', () => {
        it('should show a running state', async () => {
          const gradleTaskProvider = mockExtension.getGradleTaskProvider() as GradleTaskProvider;
          await mockExtension.getGradleTaskProvider().loadTasks();
          const task = gradleTaskProvider.findByTaskId(
            mockTaskDefinition1ForFolder1.id
          );
          assert.ok(task);
          sinon.stub(vscode.tasks, 'taskExecutions').value([
            {
              task,
            },
          ]);
          const gradleTaskTreeDataProvider = mockExtension.getGradleTasksTreeDataProvider() as GradleTasksTreeDataProvider;
          const gradleProjects = (await gradleTaskTreeDataProvider.getChildren()) as ProjectTreeItem[];
          removeCancellingTask(task);
          const group = gradleProjects[0].groups[0] as GroupTreeItem;
          const taskItem = group.tasks[0] as GradleTaskTreeItem;
          assert.equal(
            taskItem.task.definition.id,
            mockTaskDefinition1ForFolder1.id
          );
          assert.equal(taskItem.contextValue, TREE_ITEM_STATE_TASK_RUNNING);
          const iconPath = taskItem.iconPath as IconPath;
          assert.equal(
            iconPath.dark,
            path.join('resources', 'dark', ICON_LOADING)
          );
          assert.equal(
            iconPath.light,
            path.join('resources', 'light', ICON_LOADING)
          );
        });

        it('should show a cancelling state', async () => {
          const gradleTaskProvider = mockExtension.getGradleTaskProvider() as GradleTaskProvider;
          await mockExtension.getGradleTaskProvider().loadTasks();
          const task = gradleTaskProvider.findByTaskId(
            mockTaskDefinition1ForFolder1.id
          );
          assert.ok(task, 'Task was not found');
          sinon.stub(vscode.tasks, 'taskExecutions').value([
            {
              task,
            },
          ]);
          const executeCommandStub = sinon.stub(
            vscode.commands,
            'executeCommand'
          );
          cancelTaskCommand(task);
          assert.ok(
            executeCommandStub.calledWith(COMMAND_RENDER_TASK, task),
            'Task was not rendered'
          );
          const gradleTaskTreeDataProvider = mockExtension.getGradleTasksTreeDataProvider() as GradleTasksTreeDataProvider;
          const gradleProjects = (await gradleTaskTreeDataProvider.getChildren()) as ProjectTreeItem[];
          removeCancellingTask(task);
          const group = gradleProjects[0].groups[0] as GroupTreeItem;
          const taskItem = group.tasks[0] as GradleTaskTreeItem;
          assert.equal(
            taskItem.task.definition.id,
            mockTaskDefinition1ForFolder1.id
          );
          assert.equal(taskItem.contextValue, TREE_ITEM_STATE_TASK_CANCELLING);
          const iconPath = taskItem.iconPath as IconPath;
          assert.equal(
            iconPath.dark,
            path.join('resources', 'dark', ICON_GRADLE_TASK)
          );
          assert.equal(
            iconPath.light,
            path.join('resources', 'light', ICON_GRADLE_TASK)
          );
        });
      });
    });
  });

  describe('With a multi-root workspace', () => {
    beforeEach(() => {
      sinon
        .stub(vscode.workspace, 'workspaceFolders')
        .value([mockWorkspaceFolder1, mockWorkspaceFolder2]);
      mockExtension.getGradleTaskProvider().loadTasks();
    });
  });
});
