import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { RootProject } from "../../rootProject";

function rootProject(...segments: string[]): RootProject {
    const folder = path.resolve(...segments);
    const workspaceFolder = { index: 0, name: "workspace", uri: vscode.Uri.file(path.resolve(segments[0])) };
    return new RootProject(workspaceFolder, vscode.Uri.file(folder));
}

describe("RootProject", () => {
    describe("contains", () => {
        const project = rootProject("workspace", "project");

        it("contains its own directory and anything inside of it", () => {
            assert.strictEqual(project.contains(path.resolve("workspace", "project")), true);
            assert.strictEqual(project.contains(path.resolve("workspace", "project", "sub", "deeper")), true);
        });

        it("does not contain a sibling directory with the same prefix", () => {
            assert.strictEqual(project.contains(path.resolve("workspace", "project-other", "sub")), false);
        });

        it("does not contain its parent or an unrelated directory", () => {
            assert.strictEqual(project.contains(path.resolve("workspace")), false);
            assert.strictEqual(project.contains(path.resolve("elsewhere")), false);
        });
    });
});
