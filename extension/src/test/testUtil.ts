/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';
import * as sinon from 'sinon';
import * as assert from 'assert';
import { GradleTaskDefinition } from '../tasks';
import { GradleTask } from '../proto/gradle_pb';
import { TreeItemWithTasksOrGroups } from '../views';

export const EXTENSION_NAME = 'richardwillis.vscode-gradle';

export function createTestRunner(pattern: string) {
  return function run(
    testsRoot: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (error: any, failures?: number) => void
  ): void {
    // Create the mocha test
    const mocha = new Mocha({
      ui: 'bdd',
      timeout: 60000,
      color: true,
    });
    mocha.bail(true);

    glob(pattern, { cwd: testsRoot }, (err, files) => {
      if (err) {
        return cb(err);
      }

      // Add files to the test suite
      files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run((failures) => {
          cb(null, failures);
        });
      } catch (e) {
        cb(e);
      }
    });
  };
}

export function getSuiteName(subSuiteName: string): string {
  const fixtureName = process.env.FIXTURE_NAME || '(unknown fixture)';
  const suiteName = process.env.SUITE_NAME || '(unknown suite)';
  return `${suiteName} - ${subSuiteName} - ${fixtureName}`;
}

export function resetObjectStubs(objectWithStubbedMethods: {
  [key: string]: any;
}): void {
  Object.values(objectWithStubbedMethods).forEach((value: any) => {
    if (value && value.isSinonProxy) {
      value.resetHistory();
    }
  });
}

export function buildMockTerminal(name = 'Mock Task Terminal'): any {
  return {
    name,
    processId: Promise.resolve(0),
    creationOptions: {},
    exitStatus: undefined,
    sendText: sinon.spy(),
    show: sinon.spy(),
    hide: sinon.spy(),
    dispose: sinon.spy(),
  };
}

export function buildMockExtension(): any {
  return {
    getClient: sinon.stub(),
    getRecentTasksTreeDataProvider: sinon.stub(),
    getRecentTasksStore: sinon.stub(),
    getGradleTaskProvider: sinon.stub(),
    getTaskTerminalsStore: sinon.stub(),
    getIcons: sinon.stub(),
    getGradleDaemonsTreeDataProvider: sinon.stub(),
    getPinnedTasksTreeDataProvider: sinon.stub(),
    getPinnedTasksStore: sinon.stub(),
    getGradleTasksTreeDataProvider: sinon.stub(),
  };
}

export function buildMockContext(): any {
  return {
    subscriptions: [],
    workspaceState: {
      get: sinon.stub(),
      update: sinon.stub(),
    },
    asAbsolutePath(relativePath: string): string {
      return relativePath;
    },
  };
}

export function buildMockClient(): any {
  return {
    getBuild: sinon.stub(),
    getDaemonsStatus: sinon.stub(),
    stopDaemon: sinon.stub(),
    stopDaemons: sinon.stub(),
  };
}

export function buildMockWorkspaceFolder(
  index: number,
  pathName: string,
  name: string
): vscode.WorkspaceFolder {
  return {
    index,
    uri: vscode.Uri.file(pathName),
    name,
  };
}

export function buildMockOutputChannel(): any {
  return {
    name: 'Mock Output Channel',
    append: sinon.spy(),
    appendLine: sinon.spy(),
    clear: sinon.spy(),
    show: sinon.spy(),
    hide: sinon.spy(),
    dispose: sinon.spy(),
  };
}

export function buildMockTaskDefinition(
  workspaceFolder: vscode.WorkspaceFolder,
  script = 'assemble',
  description = 'Description',
  args = '',
  project = 'dropwizard-project'
): GradleTaskDefinition {
  return {
    type: 'gradle',
    id: workspaceFolder.uri.fsPath + script + project,
    script,
    description,
    group: 'build',
    project,
    buildFile: path.join(workspaceFolder.uri.fsPath, 'build.gradle'),
    rootProject: project,
    projectFolder: workspaceFolder.uri.fsPath,
    workspaceFolder: workspaceFolder.uri.fsPath,
    args,
    javaDebug: false,
  };
}

export function buildMockGradleTask(
  definition: GradleTaskDefinition
): GradleTask {
  const gradleTask = new GradleTask();
  gradleTask.setBuildfile(definition.buildFile);
  gradleTask.setName(definition.name);
  gradleTask.setPath(':' + definition.script);
  gradleTask.setProject(definition.project);
  gradleTask.setGroup(definition.group);
  gradleTask.setRootproject(definition.project);
  gradleTask.setDescription(definition.description);
  return gradleTask;
}

export function assertWorkspaceTreeItem(
  workspaceTreeItem: TreeItemWithTasksOrGroups,
  workspaceFolder: vscode.WorkspaceFolder
): void {
  assert.ok(
    workspaceTreeItem && workspaceTreeItem instanceof TreeItemWithTasksOrGroups,
    'WorkspaceTreeItem is not a TreeItemWithTasksOrGroups'
  );
  assert.equal(workspaceTreeItem.contextValue, 'folder');
  assert.equal(workspaceTreeItem.label, workspaceFolder.name);
  assert.equal(workspaceTreeItem.iconPath, vscode.ThemeIcon.Folder);
  assert.equal(workspaceTreeItem.parentTreeItem, undefined);
  assert.equal(workspaceTreeItem.resourceUri, undefined);
  assert.ok(workspaceTreeItem.tasks.length > 0);
}
