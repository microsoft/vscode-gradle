import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { RootProjectsStore } from "../../stores";

describe("RootProjectsStore", () => {
    afterEach(() => {
        sinon.restore();
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
            get: sinon.stub().withArgs("nestedProjects").returns(true),
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
            get: sinon.stub().withArgs("nestedProjects").returns(true),
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
