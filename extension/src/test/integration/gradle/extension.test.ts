import * as util from "util";
import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import * as path from "path";

import { Output } from "../../../proto/gradle_pb";
import { GradleTaskTreeItem } from "../../../views";
import { RunTaskOpts, Api as ExtensionApi, Api } from "../../../api";
import { COMMAND_REFRESH, COMMAND_RUN_TASK_WITH_ARGS } from "../../../commands";
import { getSuiteName, EXTENSION_NAME } from "../../testUtil";
import { sleep } from "../../../util";

const fixtureName = process.env.FIXTURE_NAME || "(unknown fixture)";
const fixturePath = vscode.Uri.file(path.resolve(__dirname, "../../../../test-fixtures", fixtureName));

const executeAndWaitForTask = (task: vscode.Task): Promise<void> => {
    return new Promise(async (resolve) => {
        const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
            if (e.execution.task === task) {
                disposable.dispose();
                resolve();
            }
        });
        try {
            await vscode.tasks.executeTask(task);
        } catch (e) {
            console.error("There was an error starting the task:", e.message);
        }
    });
};

describe(getSuiteName("Extension"), () => {
    let extension: vscode.Extension<Api> | undefined;

    before(() => {
        extension = vscode.extensions.getExtension(EXTENSION_NAME);
    });

    it("should be present", () => {
        assert.ok(extension);
    });

    it("should be activated", async () => {
        assert.ok(extension);
        await extension.activate();
        assert.strictEqual(extension.isActive, true);
    });

    describe("Task provider", () => {
        afterEach(() => {
            sinon.restore();
        });

        it("should load gradle tasks", async () => {
            let tasks: vscode.Task[] = [];
            for (let i = 0; i < 5; i++) {
                tasks = await vscode.tasks.fetchTasks({ type: "gradle" });
                if (tasks.length > 0) {
                    break;
                }
                await sleep(5 * 1000);
            }
            assert.ok(tasks);
            assert.strictEqual(tasks.length > 0, true);
            const helloTask = tasks.find(({ name }) => name === "hello");
            assert.ok(helloTask);
            assert.strictEqual(path.basename(helloTask.definition.projectFolder), fixtureName);
        });

        it("should refresh gradle tasks when command is executed", async () => {
            assert.ok(extension);
            const treeDataProvider = extension!.exports.getTasksTreeProvider();
            const stub = sinon.stub(treeDataProvider, "refresh");
            await vscode.commands.executeCommand(COMMAND_REFRESH);
            assert.ok(stub.called);
        });

    it('should generate a new terminal for every task run with reuseTerminals: "off"', async () => {
      await vscode.workspace
        .getConfiguration('gradle')
        .update('reuseTerminals', 'off');
      await vscode.commands.executeCommand(COMMAND_REFRESH);
      await executeAndWaitForTasks();
      assert.strictEqual(vscode.window.terminals.length, 3);
    });

    it('should generate 1 terminal per task with reuseTerminals: "task"', async () => {
      await vscode.workspace
        .getConfiguration('gradle')
        .update('reuseTerminals', 'task');
      await vscode.commands.executeCommand(COMMAND_REFRESH);
      await executeAndWaitForTasks();
      assert.strictEqual(vscode.window.terminals.length, 2);
    });

    it('should generate 1 terminal for all tasks with reuseTerminals: "all"', async () => {
      await vscode.workspace
        .getConfiguration('gradle')
        .update('reuseTerminals', 'all');
      await vscode.commands.executeCommand(COMMAND_REFRESH);
      await executeAndWaitForTasks();
      assert.strictEqual(vscode.window.terminals.length, 1);
    });
});
