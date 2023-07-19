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

        it("should run a gradle task", async () => {
            const task = (await vscode.tasks.fetchTasks({ type: "gradle" })).find(({ name }) => name === "hello");
            assert.ok(task);
            const loggerAppendSpy = sinon.spy(extension!.exports.getLogger(), "append");
            const loggerAppendLineSpy = sinon.spy(extension!.exports.getLogger(), "appendLine");
            await executeAndWaitForTask(task);
            assert.ok(loggerAppendSpy.calledWith(sinon.match("Hello, World!")));
            assert.ok(loggerAppendLineSpy.calledWith(sinon.match("Completed build: hello")));
        });

        it("should run a gradle task with custom args that contain spaces", async () => {
            sinon.stub(vscode.window, "showInputBox").returns(Promise.resolve('-PcustomProp="foo bar"'));

            assert.ok(extension);

            const task = (await vscode.tasks.fetchTasks({ type: "gradle" })).find(
                ({ name }) => name === "helloProjectProperty"
            );
            assert.ok(task);
            const spy = sinon.spy(extension.exports.getLogger(), "append");
            await new Promise(async (resolve) => {
                const endDisposable = vscode.tasks.onDidEndTaskProcess((e) => {
                    if (e.execution.task.definition.script === task.definition.script) {
                        endDisposable.dispose();
                        resolve(undefined);
                    }
                });
                const treeItem = new GradleTaskTreeItem(
                    new vscode.TreeItem("parentTreeItem"),
                    task,
                    task.name,
                    "",
                    task.definition.description,
                    extension!.exports.getIcons(),
                    false
                );
                await vscode.commands.executeCommand(COMMAND_RUN_TASK_WITH_ARGS, treeItem);
            });
            assert.ok(spy.calledWith(sinon.match('Hello, Project Property!"foo bar"')));
        });
    });

    describe("Extension api", () => {
        it("should run a task using the extension api", async () => {
            const api = extension!.exports as ExtensionApi;
            let hasMessage = false;
            const runTaskOpts: RunTaskOpts = {
                projectFolder: fixturePath.fsPath,
                taskName: "hello",
                showOutputColors: false,
                onOutput: (output: Output): void => {
                    const message = new util.TextDecoder("utf-8").decode(output.getOutputBytes_asU8()).trim();
                    if (message === "Hello, World!") {
                        hasMessage = true;
                    }
                },
            };
            await api.runTask(runTaskOpts);
            assert.ok(hasMessage);
        });
    });

    describe("Reuse terminals config", () => {
        const resetConfig = async (): Promise<void> =>
            await vscode.workspace.getConfiguration("gradle").update("reuseTerminals", "off");

        const executeAndWaitForTasks = async (): Promise<void> => {
            const tasks = await vscode.tasks.fetchTasks({ type: "gradle" });
            const byeTask = tasks.find(({ name }) => name === "bye");
            assert.ok(byeTask);
            const helloTask = tasks.find(({ name }) => name === "hello");
            assert.ok(helloTask);
            await executeAndWaitForTask(byeTask);
            await executeAndWaitForTask(byeTask);
            await executeAndWaitForTask(helloTask);
        };

        before(async () => await resetConfig());
        after(async () => await resetConfig());

        beforeEach(() => {
            vscode.window.terminals.forEach((terminal) => {
                terminal.dispose();
            });
        });

        it('should generate a new terminal for every task run with reuseTerminals: "off"', async () => {
            await vscode.workspace.getConfiguration("gradle").update("reuseTerminals", "off");
            await executeAndWaitForTasks();
            assert.strictEqual(vscode.window.terminals.length, 3);
        });

        it('should generate 1 terminal per task with reuseTerminals: "task"', async () => {
            await vscode.workspace.getConfiguration("gradle").update("reuseTerminals", "task");
            await executeAndWaitForTasks();
            assert.strictEqual(vscode.window.terminals.length, 2);
        });

        it('should generate 1 terminal for all tasks with reuseTerminals: "all"', async () => {
            await vscode.workspace.getConfiguration("gradle").update("reuseTerminals", "all");
            await executeAndWaitForTasks();
            assert.strictEqual(vscode.window.terminals.length, 1);
        });
    });
});
