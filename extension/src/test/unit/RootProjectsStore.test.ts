import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { findRootProject } from "../../client/utils";
import { RootProject } from "../../rootProject";
import { RootProjectsStore } from "../../stores";

describe("RootProjectsStore", () => {
    afterEach(() => {
        sinon.restore();
    });

    it("does not scan for nested projects when the workspace root is not a Gradle project and nestedProjects is disabled", async () => {
        const workspaceFolder = {
            index: 0,
            name: "workspace",
            uri: vscode.Uri.file(path.join("workspace")),
        };

        sinon.stub(vscode.workspace, "workspaceFolders").value([workspaceFolder]);
        sinon.stub(vscode.workspace, "getWorkspaceFolder").returns(workspaceFolder);
        sinon.stub(vscode.workspace, "getConfiguration").returns({
            get: sinon.stub().withArgs("nestedProjects", false).returns(false),
        } as unknown as vscode.WorkspaceConfiguration);
        const findFilesStub = sinon.stub(vscode.workspace, "findFiles").returns(Promise.resolve([]));
        sinon.stub(fs, "existsSync").returns(false);

        const store = new RootProjectsStore();
        const projectRoots = await store.getProjectRoots();

        assert.deepStrictEqual(projectRoots, []);
        assert.strictEqual(findFilesStub.called, false);
    });

    it("does not scan for nested projects when the workspace root is a Gradle project and nestedProjects is disabled", async () => {
        const workspaceFolder = {
            index: 0,
            name: "workspace",
            uri: vscode.Uri.file(path.join("workspace")),
        };
        const rootBuildFile = path.join(workspaceFolder.uri.fsPath, "build.gradle");

        sinon.stub(vscode.workspace, "workspaceFolders").value([workspaceFolder]);
        sinon.stub(vscode.workspace, "getWorkspaceFolder").returns(workspaceFolder);
        sinon.stub(vscode.workspace, "getConfiguration").returns({
            get: sinon.stub().withArgs("nestedProjects", false).returns(false),
        } as unknown as vscode.WorkspaceConfiguration);
        const findFilesStub = sinon.stub(vscode.workspace, "findFiles").returns(Promise.resolve([]));
        sinon.stub(fs, "existsSync").callsFake((filePath) => filePath === rootBuildFile);

        const store = new RootProjectsStore();
        const projectRoots = await store.getProjectRoots();

        assert.deepStrictEqual(
            projectRoots.map((project) => project.getProjectUri().fsPath),
            [workspaceFolder.uri.fsPath]
        );
        assert.strictEqual(findFilesStub.called, false);
    });

    it("discovers nested projects with a build.gradle file", async () => {
        const workspaceFolder = {
            index: 0,
            name: "workspace",
            uri: vscode.Uri.file(path.join("workspace")),
        };
        const nestedProjectFolder = path.join(workspaceFolder.uri.fsPath, "nested-gradle-project");
        const nestedBuildFile = vscode.Uri.file(path.join(nestedProjectFolder, "build.gradle"));

        sinon.stub(vscode.workspace, "workspaceFolders").value([workspaceFolder]);
        sinon.stub(vscode.workspace, "getWorkspaceFolder").returns(workspaceFolder);
        sinon.stub(vscode.workspace, "getConfiguration").returns({
            get: sinon.stub().withArgs("nestedProjects", false).returns(true),
        } as unknown as vscode.WorkspaceConfiguration);
        sinon.stub(vscode.workspace, "findFiles").callsFake((include) => {
            if (include === "**/{settings.gradle,settings.gradle.kts}") {
                return Promise.resolve([]);
            }
            if (include === "**/{build.gradle,build.gradle.kts}") {
                return Promise.resolve([nestedBuildFile]);
            }
            return Promise.resolve([]);
        });
        sinon.stub(fs, "existsSync").callsFake((filePath) => filePath === nestedBuildFile.fsPath);

        const store = new RootProjectsStore();
        const projectRoots = await store.getProjectRoots();

        assert.deepStrictEqual(
            projectRoots.map((project) => project.getProjectUri().fsPath),
            [nestedProjectFolder]
        );
    });

    it("does not promote Gradle subproject build files under a settings root", async () => {
        const workspaceFolder = {
            index: 0,
            name: "workspace",
            uri: vscode.Uri.file(path.join("workspace")),
        };
        const settingsFile = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, "settings.gradle"));
        const nestedProjectFolder = path.join(workspaceFolder.uri.fsPath, "nested-gradle-project");
        const nestedBuildFile = vscode.Uri.file(path.join(nestedProjectFolder, "build.gradle"));

        sinon.stub(vscode.workspace, "workspaceFolders").value([workspaceFolder]);
        sinon.stub(vscode.workspace, "getWorkspaceFolder").returns(workspaceFolder);
        sinon.stub(vscode.workspace, "getConfiguration").returns({
            get: sinon.stub().withArgs("nestedProjects", false).returns(true),
        } as unknown as vscode.WorkspaceConfiguration);
        sinon.stub(vscode.workspace, "findFiles").callsFake((include) => {
            if (include === "**/{settings.gradle,settings.gradle.kts}") {
                return Promise.resolve([settingsFile]);
            }
            if (include === "**/{build.gradle,build.gradle.kts}") {
                return Promise.resolve([nestedBuildFile]);
            }
            if (include instanceof vscode.RelativePattern) {
                return Promise.resolve([settingsFile]);
            }
            return Promise.resolve([]);
        });
        sinon.stub(fs, "existsSync").callsFake((filePath) => filePath === settingsFile.fsPath);

        const store = new RootProjectsStore();
        const projectRoots = await store.getProjectRoots();

        assert.deepStrictEqual(
            projectRoots.map((project) => project.getProjectUri().fsPath),
            [workspaceFolder.uri.fsPath]
        );
    });
});

describe("findRootProject", () => {
    function rootProject(...segments: string[]): RootProject {
        const workspaceFolder = { index: 0, name: "workspace", uri: vscode.Uri.file(path.resolve(segments[0])) };
        return new RootProject(workspaceFolder, vscode.Uri.file(path.resolve(...segments)));
    }

    function storeOf(...rootProjects: RootProject[]): RootProjectsStore {
        return { getProjectRoots: () => Promise.resolve(rootProjects) } as unknown as RootProjectsStore;
    }

    it("finds the root project that contains the path", async () => {
        const workspace = rootProject("workspace");
        const other = rootProject("other");
        const store = storeOf(workspace, other);
        assert.strictEqual(await findRootProject(store, path.resolve("workspace", "sub", "deeper")), workspace);
        assert.strictEqual(await findRootProject(store, path.resolve("elsewhere")), undefined);
    });

    it("does not find a root project for a sibling directory with the same name prefix", async () => {
        // "workspace-other" starts with "workspace" but is not inside of it
        const store = storeOf(rootProject("workspace"));
        assert.strictEqual(await findRootProject(store, path.resolve("workspace-other", "sub")), undefined);
    });

    it("prefers the closest of nested root projects", async () => {
        const workspace = rootProject("workspace");
        const nested = rootProject("workspace", "nested");
        const store = storeOf(workspace, nested);
        assert.strictEqual(await findRootProject(store, path.resolve("workspace", "nested", "sub")), nested);
    });
});
