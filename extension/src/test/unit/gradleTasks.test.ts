/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from "vscode";
import * as sinon from "sinon";
import * as assert from "assert";
import * as path from "path";

import { logger } from "../../logger";
import {
    getSuiteName,
    buildMockContext,
    buildMockClient,
    buildMockWorkspaceFolder,
    buildMockOutputChannel,
    buildMockTaskDefinition,
    buildMockGradleTask,
    stubWorkspaceFolders,
} from "../testUtil";
import { GradleBuild, GradleProject } from "../../proto/gradle_pb";
import {
    GradleTasksTreeDataProvider,
    GradleTaskTreeItem,
    ProjectTreeItem,
    GroupTreeItem,
    NoGradleTasksTreeItem,
    RootProjectTreeItem,
} from "../../views";
import { GradleTaskProvider } from "../../tasks";
import { IconPath, Icons } from "../../icons";
import {
    ICON_GRADLE_TASK,
    ICON_LOADING,
    TREE_ITEM_STATE_NO_TASKS,
    TREE_ITEM_STATE_TASK_RUNNING,
    TREE_ITEM_STATE_FOLDER,
    TREE_ITEM_STATE_TASK_IDLE,
    TREE_ITEM_STATE_TASK_CANCELLING,
    TREE_ITEM_STATE_TASK_PINNED_PREFIX,
} from "../../views/constants";
import {
    COMMAND_SHOW_LOGS,
    COMMAND_RENDER_TASK,
    CancelBuildCommand,
    ExplorerTreeCommand,
    ExplorerFlatCommand,
    PinTaskCommand,
    PinTaskWithArgsCommand,
    UnpinTaskCommand,
    UnpinAllTasksCommand,
} from "../../commands";
import { removeCancellingTask } from "../../tasks/taskUtil";
import { PinnedTasksStore, RootProjectsStore } from "../../stores";
import { getRunTaskCommandCancellationKey } from "../../client/CancellationKeys";
import { GradleDependencyProvider } from "../../dependencies/GradleDependencyProvider";
import { GradleBuildContentProvider } from "../../client/GradleBuildContentProvider";
import { SinonStub } from "sinon";
import { ProjectTaskTreeItem } from "../../views/gradleTasks/ProjectTaskTreeItem";
import { PinnedTasksTreeItem } from "../../views/gradleTasks/PinnedTasksTreeItem";

const mockContext = buildMockContext();

const mockWorkspaceFolder1 = buildMockWorkspaceFolder(0, "folder1", "folder1");
const mockWorkspaceFolder2 = buildMockWorkspaceFolder(1, "folder2", "folder2");

const mockTaskDefinition1ForFolder1 = buildMockTaskDefinition(mockWorkspaceFolder1, "assemble1", "Description 1");

const mockTaskDefinition2ForFolder1 = buildMockTaskDefinition(mockWorkspaceFolder1, "assemble2", "Description 2");

const mockTaskDefinition1ForFolder2 = buildMockTaskDefinition(
    mockWorkspaceFolder1,
    "assemble2",
    "Description 2",
    "--info"
);

const mockGradleTask1 = buildMockGradleTask(mockTaskDefinition1ForFolder1);
const mockGradleTask2 = buildMockGradleTask(mockTaskDefinition2ForFolder1);
const mockGradleTask3 = buildMockGradleTask(mockTaskDefinition1ForFolder2);

const mockGradleProjectWithTasks = new GradleProject();
mockGradleProjectWithTasks.setIsRoot(true);
mockGradleProjectWithTasks.setTasksList([mockGradleTask1, mockGradleTask2]);
const mockGradleBuildWithTasks = new GradleBuild();
mockGradleBuildWithTasks.setProject(mockGradleProjectWithTasks);

const mockGradleProjectWithTasksForMultiRoot = new GradleProject();
mockGradleProjectWithTasksForMultiRoot.setIsRoot(true);
mockGradleProjectWithTasksForMultiRoot.setTasksList([mockGradleTask1, mockGradleTask3]);
const mockGradleBuildWithTasksForMultiRoot = new GradleBuild();
mockGradleBuildWithTasksForMultiRoot.setProject(mockGradleProjectWithTasksForMultiRoot);

const mockGradleProjectWithoutTasks = new GradleProject();
mockGradleProjectWithoutTasks.setIsRoot(true);
const mockGradleBuildWithoutTasks = new GradleBuild();
mockGradleBuildWithoutTasks.setProject(mockGradleProjectWithoutTasks);

describe(getSuiteName("Gradle tasks"), () => {
    let gradleTasksTreeDataProvider: GradleTasksTreeDataProvider;
    let gradleTaskProvider: GradleTaskProvider;
    let gradleDependencyProvider: GradleDependencyProvider;
    let client: any;
    let rootProjectsStore: RootProjectsStore;
    let pinnedTasksStore: PinnedTasksStore;
    let gradleBuildContentProvider: GradleBuildContentProvider;
    beforeEach(async () => {
        client = buildMockClient();
        rootProjectsStore = new RootProjectsStore();
        pinnedTasksStore = new PinnedTasksStore(mockContext);
        gradleBuildContentProvider = new GradleBuildContentProvider(client);
        gradleTaskProvider = new GradleTaskProvider(rootProjectsStore, client, gradleBuildContentProvider);
        gradleDependencyProvider = new GradleDependencyProvider(client);
        gradleTasksTreeDataProvider = new GradleTasksTreeDataProvider(
            mockContext,
            rootProjectsStore,
            pinnedTasksStore,
            gradleTaskProvider,
            gradleDependencyProvider,
            new Icons(mockContext),
            client
        );
        logger.reset();
        logger.setLoggingChannel(buildMockOutputChannel());
    });

    afterEach(() => {
        sinon.restore();
    });

    describe("Without a multi-root workspace", () => {
        describe("With no gradle tasks", () => {
            beforeEach(async () => {
                stubWorkspaceFolders([mockWorkspaceFolder1]);
                await rootProjectsStore.populate();
            });
            it('should build a "No Tasks" tree item when no tasks are found', async () => {
                client.getBuild.resolves(mockGradleBuildWithoutTasks);
                const children = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(children.length, 1);
                const noTasksTreeItem = children[0];
                assert.ok(
                    noTasksTreeItem instanceof NoGradleTasksTreeItem,
                    "Tree item is not an instance of NoGradleTasksTreeItem"
                );
                assert.strictEqual(noTasksTreeItem.contextValue, TREE_ITEM_STATE_NO_TASKS);
                assert.strictEqual(noTasksTreeItem.description, "No tasks found");
                assert.ok(noTasksTreeItem.command, "NoGradleTasksTreeItem should have a command");
                assert.strictEqual(noTasksTreeItem.command.command, COMMAND_SHOW_LOGS);
                assert.strictEqual(noTasksTreeItem.command.title, "Show Logs");
            });
        });

        describe("With gradle tasks", () => {
            beforeEach(async () => {
                stubWorkspaceFolders([mockWorkspaceFolder1]);
                client.getBuild.resolves(mockGradleBuildWithTasks);
                await rootProjectsStore.populate();
            });

            describe("Expanded tree", () => {
                let gradleProjects: vscode.TreeItem[] = [];
                beforeEach(async () => {
                    gradleProjects = await gradleTasksTreeDataProvider.getChildren();
                });

                it("should build project items at top level", () => {
                    assert.ok(gradleProjects.length > 0, "No gradle projects found");
                    assert.strictEqual(
                        gradleProjects.length,
                        1,
                        "There should only be one project if two tasks share the same project & buildfile"
                    );
                    const projectItem = gradleProjects[0] as ProjectTreeItem;
                    assert.ok(projectItem instanceof ProjectTreeItem, "Gradle project is not a ProjectTreeItem");
                    assert.strictEqual(
                        projectItem.groups.length,
                        1,
                        "There should only be one group if there are multiple tasks that share the same group"
                    );
                    assert.strictEqual(projectItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
                    assert.strictEqual(projectItem.contextValue, TREE_ITEM_STATE_FOLDER);
                    assert.strictEqual(projectItem.label, mockTaskDefinition1ForFolder1.project);
                    assert.ok(
                        projectItem.parentTreeItem instanceof RootProjectTreeItem,
                        "parentTreeItem must be a RootProjectTreeItem"
                    );
                    assert.ok(projectItem.resourceUri, "resourceUri must be set for a ProjectTreeItem");
                    assert.strictEqual(projectItem.resourceUri.fsPath, mockTaskDefinition1ForFolder1.buildFile);
                    assert.strictEqual(projectItem.iconPath, vscode.ThemeIcon.File);
                    assert.strictEqual(
                        projectItem.tasks.length,
                        0,
                        "There should not be any tasks for a ProjectTreeItem if the tree is not collapsed"
                    );
                });

                it("should build task group items", () => {
                    const projectItem = gradleProjects[0] as ProjectTreeItem;
                    const groupItem = projectItem.groups[0];
                    assert.ok(groupItem instanceof GroupTreeItem, "Group is not a GroupTreeItem");
                    assert.strictEqual(groupItem.contextValue, TREE_ITEM_STATE_FOLDER);
                    assert.strictEqual(groupItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
                    assert.strictEqual(groupItem.label, mockTaskDefinition1ForFolder1.group);
                    assert.strictEqual(
                        groupItem.parentTreeItem,
                        projectItem,
                        "GroupTreeItem parentItem must be ProjectTreeItem"
                    );
                    assert.strictEqual(groupItem.tasks.length, 2);
                });

                it("should build task items", () => {
                    const projectItem = gradleProjects[0] as ProjectTreeItem;
                    const groupItem = projectItem.groups[0];
                    const gradleTasks = groupItem.tasks;
                    const taskItem = gradleTasks[0];
                    assert.ok(taskItem instanceof GradleTaskTreeItem, "TreeItem is not a GradleTaskTreeItem");
                    assert.strictEqual(taskItem.contextValue, TREE_ITEM_STATE_TASK_IDLE);
                    assert.strictEqual(taskItem.description, "");
                    assert.strictEqual(taskItem.label, mockTaskDefinition1ForFolder1.script);
                    assert.strictEqual(taskItem.tooltip, mockTaskDefinition1ForFolder1.description);
                    assert.strictEqual(taskItem.task.definition.id, mockTaskDefinition1ForFolder1.id);
                    const iconPath = taskItem.iconPath as IconPath;
                    assert.strictEqual(iconPath.dark, path.join("resources", "dark", ICON_GRADLE_TASK));
                    assert.strictEqual(iconPath.light, path.join("resources", "light", ICON_GRADLE_TASK));
                    assert.strictEqual(taskItem.parentTreeItem, groupItem);
                });
            });

            describe("Collapsed tree", () => {
                let gradleProjects: vscode.TreeItem[] = [];
                beforeEach(async () => {
                    await new ExplorerFlatCommand(gradleTasksTreeDataProvider).run();
                    gradleProjects = await gradleTasksTreeDataProvider.getChildren();
                });

                it("should build project items at top level", () => {
                    assert.ok(gradleProjects.length > 0, "No gradle projects found");
                    assert.strictEqual(
                        gradleProjects.length,
                        1,
                        "There should only be one project if two tasks share the same project & buildfile"
                    );
                    const projectItem = gradleProjects[0] as ProjectTreeItem;
                    assert.strictEqual(projectItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
                    assert.ok(projectItem instanceof ProjectTreeItem, "Gradle project is not a ProjectTreeItem");
                    assert.ok(
                        projectItem.parentTreeItem instanceof RootProjectTreeItem,
                        "parentTreeItem must be a RootProjectTreeItem"
                    );
                });

                it("should build task items", () => {
                    const projectItem = gradleProjects[0] as ProjectTreeItem;
                    assert.strictEqual(projectItem.groups.length, 0, "ProjectTreeItem should not have any groups");
                    assert.strictEqual(projectItem.tasks.length, 2, "Tasks should be listed under projects");
                    assert.ok(
                        projectItem.tasks[0] instanceof GradleTaskTreeItem,
                        "Tree item should be GradleTaskTreeItem"
                    );
                    assert.ok(
                        projectItem.tasks[1] instanceof GradleTaskTreeItem,
                        "Tree item should be GradleTaskTreeItem"
                    );
                });
            });

            describe("Task state", () => {
                it("should show a running state", async () => {
                    await gradleTaskProvider.loadTasks();
                    const task = gradleTaskProvider.findByTaskId(mockTaskDefinition1ForFolder1.id);
                    assert.ok(task);
                    sinon.stub(vscode.tasks, "taskExecutions").value([
                        {
                            task,
                        },
                    ]);
                    const gradleProjects = (await gradleTasksTreeDataProvider.getChildren()) as ProjectTreeItem[];
                    removeCancellingTask(task);
                    const group = gradleProjects[0].groups[0];
                    const taskItem = group.tasks[0];
                    assert.strictEqual(taskItem.task.definition.id, mockTaskDefinition1ForFolder1.id);
                    assert.strictEqual(taskItem.contextValue, TREE_ITEM_STATE_TASK_RUNNING);
                    const iconPath = taskItem.iconPath as IconPath;
                    assert.strictEqual(iconPath.dark, path.join("resources", "dark", ICON_LOADING));
                    assert.strictEqual(iconPath.light, path.join("resources", "light", ICON_LOADING));
                });

                it("should show a cancelling state", async () => {
                    await gradleTaskProvider.loadTasks();
                    const task = gradleTaskProvider.findByTaskId(mockTaskDefinition1ForFolder1.id);
                    assert.ok(task, "Task was not found");
                    sinon.stub(vscode.tasks, "taskExecutions").value([
                        {
                            task,
                        },
                    ]);
                    const executeCommandStub = sinon.stub(vscode.commands, "executeCommand");
                    const cancellationKey = getRunTaskCommandCancellationKey(
                        mockTaskDefinition1ForFolder1.projectFolder,
                        task.name
                    );
                    await new CancelBuildCommand(client).run(cancellationKey, task);
                    assert.ok(executeCommandStub.calledWith(COMMAND_RENDER_TASK, task), "Task was not rendered");
                    const gradleProjects = (await gradleTasksTreeDataProvider.getChildren()) as ProjectTreeItem[];
                    removeCancellingTask(task);
                    const group = gradleProjects[0].groups[0];
                    const taskItem = group.tasks[0];
                    assert.strictEqual(taskItem.task.definition.id, mockTaskDefinition1ForFolder1.id);
                    assert.strictEqual(taskItem.contextValue, TREE_ITEM_STATE_TASK_CANCELLING);
                    const iconPath = taskItem.iconPath as IconPath;
                    assert.strictEqual(iconPath.dark, path.join("resources", "dark", ICON_GRADLE_TASK));
                    assert.strictEqual(iconPath.light, path.join("resources", "light", ICON_GRADLE_TASK));
                });
            });
        });

        describe("With pinned tasks", () => {
            let gradleProjects: vscode.TreeItem[] = [];
            let gradleTasks: GradleTaskTreeItem[] = [];
            beforeEach(async () => {
                stubWorkspaceFolders([mockWorkspaceFolder1]);
                client.getBuild.resolves(mockGradleBuildWithTasks);
                await rootProjectsStore.populate();
                gradleProjects = await gradleTasksTreeDataProvider.getChildren();
                assert.ok(gradleProjects.length > 0, "No gradle projects found");
                assert.ok(gradleProjects[0] instanceof ProjectTreeItem, "Gradle project is not a ProjectTreeItem");
                const projectItem = gradleProjects[0] as ProjectTreeItem;
                const groupItem = projectItem.groups[0];
                assert.ok(groupItem instanceof GroupTreeItem, "Group is not a GroupTreeItem");
                gradleTasks = groupItem.tasks;
            });
            it("should build a pinned task treeitem", async () => {
                const taskItem = gradleTasks[0];
                assert.ok(taskItem instanceof GradleTaskTreeItem, "TreeItem is not a GradleTaskTreeItem");
                await new PinTaskCommand(pinnedTasksStore, gradleTasksTreeDataProvider).run(taskItem);
                const projectTreeItems = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(projectTreeItems.length, 2);
                assert.ok(
                    projectTreeItems[0] instanceof PinnedTasksTreeItem,
                    "First item is not a PinnedTasksTreeItem"
                );
                const pinnedTasksTreeItem = projectTreeItems[0] as PinnedTasksTreeItem;
                const children = pinnedTasksTreeItem.getChildren();
                assert.strictEqual(children.length, 1);
                const pinnedTaskItem = children[0] as GradleTaskTreeItem;
                assert.strictEqual(pinnedTaskItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
                assert.strictEqual(
                    pinnedTaskItem.contextValue,
                    TREE_ITEM_STATE_TASK_PINNED_PREFIX + TREE_ITEM_STATE_TASK_IDLE
                );
                assert.strictEqual(pinnedTaskItem.description, "");
                assert.strictEqual(pinnedTaskItem.label, mockTaskDefinition1ForFolder1.script);
                assert.strictEqual(pinnedTaskItem.tooltip, mockTaskDefinition1ForFolder1.description);
                assert.strictEqual(pinnedTaskItem.task.definition.id, mockTaskDefinition1ForFolder1.id);
                const iconPath = pinnedTaskItem.iconPath as IconPath;
                assert.strictEqual(iconPath.dark, path.join("resources", "dark", ICON_GRADLE_TASK));
                assert.strictEqual(iconPath.light, path.join("resources", "light", ICON_GRADLE_TASK));
            });

            it("should build a pinned task treeitem with args", async () => {
                const taskItem = gradleTasks[0];
                assert.ok(taskItem instanceof GradleTaskTreeItem, "TreeItem is not a GradleTaskTreeItem");
                sinon.stub(vscode.window, "showInputBox").resolves("--info "); // intentional trailing space
                await new PinTaskWithArgsCommand(pinnedTasksStore, gradleTasksTreeDataProvider).run(taskItem);
                const projectTreeItems = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(projectTreeItems.length, 2);
                assert.ok(
                    projectTreeItems[0] instanceof PinnedTasksTreeItem,
                    "First item is not a PinnedTasksTreeItem"
                );
                const pinnedTasksTreeItem = projectTreeItems[0] as PinnedTasksTreeItem;
                const children = pinnedTasksTreeItem.getChildren();
                assert.strictEqual(children.length, 1);
                const pinnedTaskItem = children[0] as GradleTaskTreeItem;
                assert.strictEqual(pinnedTaskItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
                assert.strictEqual(
                    pinnedTaskItem.contextValue,
                    TREE_ITEM_STATE_TASK_PINNED_PREFIX + TREE_ITEM_STATE_TASK_IDLE + "WithArgs"
                );
                assert.strictEqual(pinnedTaskItem.description, "");
                assert.strictEqual(pinnedTaskItem.label, mockTaskDefinition1ForFolder1.script + " --info");
                assert.strictEqual(pinnedTaskItem.tooltip, mockTaskDefinition1ForFolder1.description);
                assert.strictEqual(pinnedTaskItem.task.definition.id, mockTaskDefinition1ForFolder1.id);
                const iconPath = pinnedTaskItem.iconPath as IconPath;
                assert.strictEqual(iconPath.dark, path.join("resources", "dark", ICON_GRADLE_TASK));
                assert.strictEqual(iconPath.light, path.join("resources", "light", ICON_GRADLE_TASK));
            });

            it("should build a pinned task treeitem with args when pinning an existing pinned task", async () => {
                const taskItem = gradleTasks[0];
                assert.ok(taskItem instanceof GradleTaskTreeItem, "TreeItem is not a GradleTaskTreeItem");
                await new PinTaskCommand(pinnedTasksStore, gradleTasksTreeDataProvider).run(taskItem);
                const childrenBefore = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(childrenBefore.length, 2);
                assert.ok(childrenBefore[0] instanceof PinnedTasksTreeItem, "First item is not a PinnedTasksTreeItem");
                const pinnedTasksItem = childrenBefore[0] as PinnedTasksTreeItem;
                const pinnedTaskItems = pinnedTasksItem.getChildren();
                assert.strictEqual(pinnedTaskItems?.length, 1);
                const pinnedTaskItemBefore = pinnedTaskItems[0] as GradleTaskTreeItem;
                sinon.stub(vscode.window, "showInputBox").resolves("--info "); // intentional trailing space
                await new PinTaskWithArgsCommand(pinnedTasksStore, gradleTasksTreeDataProvider).run(
                    pinnedTaskItemBefore as GradleTaskTreeItem
                );
                const childrenAfter = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(childrenAfter.length, 2);
                assert.ok(childrenAfter[0] instanceof PinnedTasksTreeItem, "First item is not a PinnedTasksTreeItem");
                const projectTaskTreeItemAfter = childrenAfter[0] as PinnedTasksTreeItem;
                const pinnedTaskTreeItems = projectTaskTreeItemAfter.getChildren();
                assert.strictEqual(pinnedTaskTreeItems?.length, 2);
                assert.strictEqual(
                    (pinnedTaskTreeItems[0] as GradleTaskTreeItem).task.definition.script,
                    (pinnedTaskTreeItems[1] as GradleTaskTreeItem).task.definition.script
                );
                const pinnedTaskWithArgsTreeItem = pinnedTaskTreeItems[1] as GradleTaskTreeItem;
                assert.strictEqual(pinnedTaskWithArgsTreeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
                assert.strictEqual(
                    pinnedTaskWithArgsTreeItem.contextValue,
                    TREE_ITEM_STATE_TASK_PINNED_PREFIX + TREE_ITEM_STATE_TASK_IDLE + "WithArgs"
                );
                assert.strictEqual(pinnedTaskWithArgsTreeItem.description, "");
                assert.strictEqual(pinnedTaskWithArgsTreeItem.label, `${mockTaskDefinition1ForFolder1.script} --info`);
                assert.strictEqual(pinnedTaskWithArgsTreeItem.tooltip, mockTaskDefinition1ForFolder1.description);
            });

            it("should unpin a task", async () => {
                const taskItem = gradleTasks[0];
                await new PinTaskCommand(pinnedTasksStore, gradleTasksTreeDataProvider).run(taskItem);
                const childrenBefore = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(childrenBefore.length, 2);
                assert.ok(childrenBefore[0] instanceof PinnedTasksTreeItem, "First item is not a PinnedTasksTreeItem");
                const pinnedTasksItem = childrenBefore[0] as PinnedTasksTreeItem;
                const pinnedTaskItems = pinnedTasksItem.getChildren();
                assert.strictEqual(pinnedTaskItems?.length, 1);
                const pinnedTaskItemBefore = pinnedTaskItems[0] as GradleTaskTreeItem;
                assert.ok(pinnedTaskItemBefore instanceof GradleTaskTreeItem, "Pinned task is not PinnedTaskTreeItem");
                await new UnpinTaskCommand(pinnedTasksStore, gradleTasksTreeDataProvider).run(pinnedTaskItemBefore);
                const childrenAfter = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(childrenAfter.length, 1);
                assert.ok(childrenAfter[0] instanceof ProjectTreeItem, "Gradle project is not a ProjectTreeItem");
                const projectTreeItemAfter = childrenAfter[0] as ProjectTreeItem;
                const projectTreeItemChildrenAfter = await gradleTasksTreeDataProvider.getChildrenForProjectTreeItem(
                    projectTreeItemAfter
                );
                assert.strictEqual(projectTreeItemChildrenAfter.length, 2);
                assert.ok(
                    projectTreeItemChildrenAfter[0] instanceof ProjectTaskTreeItem,
                    "project item's first children is not a ProjectTaskTreeItem"
                );
                const projectTaskTreeItemAfter = projectTreeItemChildrenAfter[0] as ProjectTaskTreeItem;
                const taskTreeItemChildrenAfter = projectTaskTreeItemAfter.getChildren();
                assert.strictEqual(taskTreeItemChildrenAfter?.length, 1, "no pinned task item should exist");
            });

            it("should unpin all tasks", async () => {
                await new PinTaskCommand(pinnedTasksStore, gradleTasksTreeDataProvider).run(gradleTasks[0]);
                await new PinTaskCommand(pinnedTasksStore, gradleTasksTreeDataProvider).run(gradleTasks[1]);
                const childrenBefore = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(childrenBefore.length, 2);
                assert.ok(childrenBefore[0] instanceof PinnedTasksTreeItem, "First item is not a PinnedTasksTreeItem");
                const showWarningMessageStub = (sinon.stub(vscode.window, "showWarningMessage") as SinonStub).resolves(
                    "Yes"
                );
                await new UnpinAllTasksCommand(pinnedTasksStore, gradleTasksTreeDataProvider).run();
                assert.ok(
                    showWarningMessageStub.calledWith("Are you sure you want to clear the pinned tasks?"),
                    "Clear all pinned tasks confirmation message not shown"
                );
                const childrenAfter = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(childrenAfter.length, 1);
                assert.ok(childrenAfter[0] instanceof ProjectTreeItem, "Gradle project is not a ProjectTreeItem");
                const projectTreeItemAfter = childrenAfter[0] as ProjectTreeItem;
                const projectTreeItemChildrenAfter = await gradleTasksTreeDataProvider.getChildrenForProjectTreeItem(
                    projectTreeItemAfter
                );
                assert.strictEqual(projectTreeItemChildrenAfter.length, 2);
                assert.ok(
                    projectTreeItemChildrenAfter[0] instanceof ProjectTaskTreeItem,
                    "project item's first children is not a ProjectTaskTreeItem"
                );
                const projectTaskTreeItemAfter = projectTreeItemChildrenAfter[0] as ProjectTaskTreeItem;
                const taskTreeItemChildrenAfter = projectTaskTreeItemAfter.getChildren();
                assert.strictEqual(taskTreeItemChildrenAfter?.length, 1, "no pinned task item should exist");
            });
        });
    });

    describe("With a multi-root workspace", () => {
        beforeEach(async () => {
            stubWorkspaceFolders([mockWorkspaceFolder1, mockWorkspaceFolder2]);
            await rootProjectsStore.populate();
        });

        describe("Without gradle tasks", () => {
            it('should build a "No Tasks" tree item when no tasks are found', async () => {
                client.getBuild.resolves(mockGradleBuildWithoutTasks);
                const children = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(children.length, 1);
            });
        });

        describe("With gradle tasks", () => {
            beforeEach(async () => {
                client.getBuild.resolves(mockGradleBuildWithTasksForMultiRoot);
                await new ExplorerTreeCommand(gradleTasksTreeDataProvider).run();
            });

            it("should build root RootProject items at top level", async () => {
                const rootProjectItems = await gradleTasksTreeDataProvider.getChildren();
                assert.ok(rootProjectItems.length > 0, "No root gradle projects found");
                assert.strictEqual(
                    rootProjectItems.length,
                    2,
                    "There should multi RootProject items when there are multi tasks belonging to different root projects"
                );
                const rootProjectItem = rootProjectItems[0] as RootProjectTreeItem;
                assert.ok(rootProjectItem instanceof RootProjectTreeItem, "Tree item is not a RootProjectTreeItem");
                assert.strictEqual(
                    rootProjectItem.projects.length,
                    1,
                    "There should only be one project belonging to this RootProject"
                );
                assert.strictEqual(rootProjectItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
                assert.strictEqual(rootProjectItem.contextValue, TREE_ITEM_STATE_FOLDER);
                assert.strictEqual(rootProjectItem.label, mockWorkspaceFolder1.name);
                assert.strictEqual(rootProjectItem.iconPath, vscode.ThemeIcon.Folder);
                assert.ok(rootProjectItem.resourceUri, "ResourceUri is not set on RootProject");
                assert.strictEqual(rootProjectItem.resourceUri.fsPath, mockWorkspaceFolder1.uri.fsPath);
            });
        });

        describe("With pinned tasks", () => {
            beforeEach(async () => {
                client.getBuild.resolves(mockGradleBuildWithTasksForMultiRoot);
                await new ExplorerTreeCommand(gradleTasksTreeDataProvider).run();
            });

            it("should build a pinned task treeitem", async () => {
                const workspaceTreeItems = await gradleTasksTreeDataProvider.getChildren();
                assert.ok(workspaceTreeItems.length > 0, "No gradle projects found");
                const workspaceTreeItem = workspaceTreeItems[0] as RootProjectTreeItem;
                assert.ok(
                    workspaceTreeItem instanceof RootProjectTreeItem,
                    "Workspace tree item is not a RootProjectTreeItem"
                );
                const projectItem = workspaceTreeItem.projects[0];
                assert.ok(projectItem instanceof ProjectTreeItem, "Project item is not a ProjectTreeItem");
                const groupItem = projectItem.groups[0];
                assert.ok(groupItem instanceof GroupTreeItem, "Group is not a GroupTreeItem");
                const taskItem = groupItem.tasks[0];
                assert.ok(taskItem instanceof GradleTaskTreeItem, "TreeItem is not a GradleTaskTreeItem");
                await new PinTaskCommand(pinnedTasksStore, gradleTasksTreeDataProvider).run(taskItem);
                const children = await gradleTasksTreeDataProvider.getChildren();
                assert.strictEqual(children.length, 3);
                const pinnedTasksTreeItem = children[0] as PinnedTasksTreeItem;
                const pinnedTaskTreeItems = pinnedTasksTreeItem.getChildren();
                assert.strictEqual(pinnedTaskTreeItems?.length, 1);
                const pinnedTaskTreeItem = pinnedTaskTreeItems[0] as GradleTaskTreeItem;
                assert.strictEqual(pinnedTaskTreeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
                assert.strictEqual(pinnedTaskTreeItem.contextValue, "folder");
                assert.strictEqual(pinnedTaskTreeItem.description, undefined);
                assert.strictEqual(pinnedTaskTreeItem.label, "folder1");
            });
        });
    });
});
