/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { GradleBuild, GradleProject, GradleTask } from '../../proto/gradle_pb';
import { RootProject } from '../../rootProject/RootProject';
import { TaskTerminalsStore } from '../../stores';
import { loadTasksForProjectRoots } from '../../tasks/taskUtil';
import { buildMockClient, getSuiteName } from '../testUtil';

const mockWorkspaceFolder: vscode.WorkspaceFolder = {
  index: 0,
  uri: vscode.Uri.file('folder1'),
  name: 'folder1',
};

const mockRootProject = new RootProject(
  mockWorkspaceFolder,
  vscode.Uri.file('folder1'),
  {
    tasks: [],
    clean: false,
  }
);
const mockClient = buildMockClient();
const mockTaskTerminalsStore = new TaskTerminalsStore();

function buildProject(
  project: string,
  rootProject: string,
  isRoot: boolean,
  tasksPerProject: number
): GradleProject {
  const gradleProject = new GradleProject();
  gradleProject.setIsRoot(isRoot);

  const tasks: Array<GradleTask> = [];
  for (let i = 0; i < tasksPerProject; i++) {
    const gradleTask = new GradleTask();
    gradleTask.setName(`test-${project}-task-name-${Math.random()}`);
    gradleTask.setProject(project);
    gradleTask.setRootproject(rootProject);
    tasks.push(gradleTask);
  }

  gradleProject.setTasksList(tasks);
  return gradleProject;
}

function getDeeplyNestedProjectTree(
  amountOfProjects: number,
  tasksPerProject: number,
  levels: number,
  currentLevel = 1
): Array<GradleProject> {
  const projects: Array<GradleProject> = [];
  for (let i = 0; i < amountOfProjects; i++) {
    const project = buildProject(
      'child-project',
      'root-project',
      false,
      tasksPerProject
    );
    if (currentLevel < levels) {
      project.setProjectsList(
        getDeeplyNestedProjectTree(
          amountOfProjects,
          tasksPerProject,
          levels,
          currentLevel + 1
        )
      );
    }
    projects.push(project);
  }
  return projects;
}

describe(getSuiteName('taskUtil'), () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should create vscode tasks', async () => {
    const gradleBuild = new GradleBuild();
    const rootGradleProject = buildProject(
      'root-project',
      'root-project',
      true,
      1
    );
    const childGradleProject = buildProject(
      'child-project',
      'root-project',
      false,
      1
    );
    rootGradleProject.setProjectsList([childGradleProject]);
    gradleBuild.setProject(rootGradleProject);
    mockClient.getBuild.resolves(Promise.resolve(gradleBuild));

    const tasks = await loadTasksForProjectRoots(
      mockTaskTerminalsStore,
      mockClient,
      [mockRootProject]
    );
    assert.strictEqual(tasks.length, 2);
  });

  it('should create vscode tasks for a super-massive project without throwing a callstack error', async () => {
    const gradleBuild = new GradleBuild();
    const rootGradleProject = buildProject(
      'root-project',
      'root-project',
      true,
      1
    );

    const projectsList = getDeeplyNestedProjectTree(50, 2, 3);

    rootGradleProject.setProjectsList(projectsList);
    gradleBuild.setProject(rootGradleProject);
    mockClient.getBuild.resolves(Promise.resolve(gradleBuild));

    const tasks = await loadTasksForProjectRoots(
      mockTaskTerminalsStore,
      mockClient,
      [mockRootProject]
    );
    assert.strictEqual(tasks.length, 255101);
  });
});
