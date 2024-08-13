/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from "vscode";
import * as path from "path";
import * as Mocha from "mocha";
import { globSync } from "glob";
import * as sinon from "sinon";
import * as assert from "assert";
import * as fs from "fs";
import { GradleTaskDefinition } from "../tasks";
import { GradleTask } from "../proto/gradle_pb";
import { TREE_ITEM_STATE_FOLDER } from "../views/constants";

export const EXTENSION_NAME = "vscjava.vscode-gradle";

export function createTestRunner(pattern: string) {
    return function run(
        testsRoot: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cb: (error: any, failures?: number) => void
    ): void {
        // Create the mocha test
        const mocha = new Mocha({
            ui: "bdd",
            timeout: 60000,
            color: true,
        });
        mocha.bail(true);

        const files = globSync(pattern, { cwd: testsRoot });
        files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));
        try {
            // Run the mocha test
            mocha.run((failures) => {
                cb(null, failures);
            });
        } catch (e) {
            cb(e);
        }
    };
}

export function getSuiteName(subSuiteName: string): string {
    const fixtureName = process.env.FIXTURE_NAME || "(unknown fixture)";
    const suiteName = process.env.SUITE_NAME || "(unknown suite)";
    return `${suiteName} - ${subSuiteName} - ${fixtureName}`;
}

export function resetObjectStubs(objectWithStubbedMethods: { [key: string]: any }): void {
    Object.values(objectWithStubbedMethods).forEach((value: any) => {
        if (value && value.isSinonProxy) {
            value.resetHistory();
        }
    });
}

export function buildMockTerminal(name = "Mock Task Terminal"): any {
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
        getTaskTerminalsStore: sinon.stub(),
        getIcons: sinon.stub(),
        getGradleDaemonsTreeDataProvider: sinon.stub(),
        getPinnedTasksStore: sinon.stub(),
        getGradleTasksTreeDataProvider: sinon.stub(),
        getRootProjectsStore: sinon.stub(),
    };
}

export function stubWorkspaceFolders(workspaceFolders: vscode.WorkspaceFolder[]): void {
    sinon.stub(vscode.workspace, "workspaceFolders").value(workspaceFolders);
    const existsSyncStub = sinon.stub(fs, "existsSync");
    const getWorkspaceFolderStub = sinon.stub(vscode.workspace, "getWorkspaceFolder");
    const dirnameStub = sinon.stub(path, "dirname");
    workspaceFolders.forEach((workspaceFolder) => {
        existsSyncStub.withArgs(path.join(workspaceFolder.uri.fsPath, "gradlew")).returns(true);
        getWorkspaceFolderStub.withArgs(sinon.match.has("fsPath", workspaceFolder.uri.fsPath)).returns(workspaceFolder);
        dirnameStub.withArgs(workspaceFolder.uri.fsPath).returns(workspaceFolder.uri.fsPath);
    });
    sinon
        .stub(vscode.workspace, "findFiles")
        .withArgs("**/{gradlew,gradlew.bat}")
        .returns(Promise.resolve(workspaceFolders.map((folder) => folder.uri)));
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
        cancelRunTask: sinon.stub(),
    };
}

export function buildMockWorkspaceFolder(index: number, pathName: string, name: string): vscode.WorkspaceFolder {
    return {
        index,
        uri: vscode.Uri.file(pathName),
        name,
    };
}

export function buildMockOutputChannel(): any {
    return {
        name: "Mock Output Channel",
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
    script = "assemble",
    description = "Description",
    args = "",
    project = "dropwizard-project"
): GradleTaskDefinition {
    return {
        type: "gradle",
        id: workspaceFolder.uri.fsPath + script + project,
        script,
        description,
        group: "build",
        project,
        buildFile: path.join(workspaceFolder.uri.fsPath, "build.gradle"),
        rootProject: project,
        projectFolder: workspaceFolder.uri.fsPath,
        workspaceFolder: workspaceFolder.uri.fsPath,
        debuggable: false,
        args,
        javaDebug: false,
        isPinned: false,
    };
}

export function buildMockGradleTask(definition: GradleTaskDefinition): GradleTask {
    const gradleTask = new GradleTask();
    gradleTask.setBuildfile(definition.buildFile);
    gradleTask.setName(definition.name);
    gradleTask.setPath(":" + definition.script);
    gradleTask.setProject(definition.project);
    gradleTask.setGroup(definition.group);
    gradleTask.setRootproject(definition.project);
    gradleTask.setDescription(definition.description);
    return gradleTask;
}

export function assertFolderTreeItem(
    workspaceTreeItem: vscode.TreeItem,
    workspaceFolder: vscode.WorkspaceFolder
): void {
    assert.ok(workspaceTreeItem);
    assert.strictEqual(workspaceTreeItem.contextValue, TREE_ITEM_STATE_FOLDER);
    assert.strictEqual(workspaceTreeItem.label, workspaceFolder.name);
    assert.strictEqual(workspaceTreeItem.iconPath, vscode.ThemeIcon.Folder);
    assert.strictEqual(workspaceTreeItem.resourceUri, undefined);
}
