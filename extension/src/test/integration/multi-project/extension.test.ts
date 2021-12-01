import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { Api } from "../../../api";
import { EXTENSION_NAME } from "../../testUtil";

const fixtureName = process.env.FIXTURE_NAME || "(unknown fixture)";
const suiteName = process.env.SUITE_NAME || "(unknown suite)";

describe(`${suiteName} - ${fixtureName}`, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let extension: vscode.Extension<Api> | undefined;

    before(() => {
        extension = vscode.extensions.getExtension(EXTENSION_NAME);
    });

    afterEach(() => {
        sinon.restore();
    });

    it("should be present", () => {
        assert.ok(extension);
    });

    it("should be activated", () => {
        assert.ok(extension);
        assert.strictEqual(extension.isActive, true);
    });

    describe("tasks", () => {
        let tasks: vscode.Task[] | undefined;

        beforeEach(async () => {
            tasks = await vscode.tasks.fetchTasks({ type: "gradle" });
        });

        it("should load tasks", async () => {
            assert.strictEqual(tasks!.length > 0, true);
        });

        it("should run a gradle task", async () => {
            assert.ok(extension);
            const task = tasks!.find(({ name }) => name === "hello");
            assert.ok(task);
            const spy = sinon.spy(extension.exports.getLogger(), "append");
            await new Promise(async (resolve) => {
                const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
                    if (e.execution.task === task) {
                        disposable.dispose();
                        resolve(undefined);
                    }
                });
                try {
                    await vscode.tasks.executeTask(task!);
                } catch (e) {
                    console.error("There was an error starting the task:", e.message);
                }
            });
            assert.ok(spy.calledWith(sinon.match("Hello, World!")));
        });

        it("should run a subproject gradle task", async () => {
            assert.ok(extension);
            const task = tasks!.find(
                ({ definition }) =>
                    definition.script === "subproject-example:sub-subproject-example:helloGroovySubSubProject"
            );
            assert.ok(task);
            const spy = sinon.spy(extension.exports.getLogger(), "append");
            await new Promise(async (resolve) => {
                const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
                    if (e.execution.task === task) {
                        disposable.dispose();
                        resolve(undefined);
                    }
                });
                try {
                    await vscode.tasks.executeTask(task!);
                } catch (e) {
                    console.error("There was an error starting the task:", e.message);
                }
            });
            assert.ok(spy.calledWith(sinon.match("Hello, World! SubSubProject")));
        });
    });
});
