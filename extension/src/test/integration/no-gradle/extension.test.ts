import * as assert from "assert";
import * as vscode from "vscode";
import { Api } from "../../../api";
import { EXTENSION_NAME } from "../../testUtil";

describe("without any build file or local gradle wrapper", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let extension: vscode.Extension<Api> | undefined;

    before(() => {
        extension = vscode.extensions.getExtension(EXTENSION_NAME);
    });

    it("should be present", () => {
        assert.ok(extension);
    });

    it("should not be activated", async () => {
        assert.ok(extension);
        assert.strictEqual(extension.isActive, false);
        // This promise never resolves. Seems like this behaviour was changed in vscode-1.45.0
        // const tasks = await vscode.tasks.fetchTasks({
        //   type: 'fooo',
        // });
        // assert.strictEqual(tasks.length === 0, true);
    });
});
