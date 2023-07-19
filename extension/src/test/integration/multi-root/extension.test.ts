import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { COMMAND_REFRESH } from "../../../commands";
import { Api } from "../../../api";
import { EXTENSION_NAME } from "../../testUtil";
import { sleep } from "../../../util";

const fixtureName = process.env.FIXTURE_NAME || "(unknown fixture)";
const suiteName = process.env.SUITE_NAME || "(unknown suite)";

describe(`${suiteName} - ${fixtureName}`, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let extension: vscode.Extension<Api> | undefined;

    before(() => {
        extension = vscode.extensions.getExtension(EXTENSION_NAME);
    });

    describe("extension", () => {
        it("should be present", () => {
            assert.ok(extension);
        });

        it("should be activated", async () => {
            assert.ok(extension);
            await extension.activate();
            assert.strictEqual(extension.isActive, true);
        });

        describe("tasks", () => {
            let tasks: vscode.Task[] | undefined;

            beforeEach(async () => {
                for (let i = 0; i < 5; i++) {
                    tasks = await vscode.tasks.fetchTasks({ type: "gradle" });
                    if (tasks.length > 0) {
                        break;
                    }
                    await sleep(5 * 1000);
                }
            });

            it("should load groovy default build file tasks", () => {
                const groovyDefaultTask = tasks!.find(({ name }) => name === "helloGroovyDefault");
                assert.ok(groovyDefaultTask);
                assert.strictEqual(groovyDefaultTask.definition.project, "gradle");
            });

            it("should load kotlin default build file tasks", () => {
                const kotlinTask = tasks!.find(({ name }) => name === "helloKotlinDefault");
                assert.ok(kotlinTask);
                assert.strictEqual(kotlinTask.definition.project, "gradle-kotlin");
            });

            it("should load groovy custom build file tasks", () => {
                const groovyCustomTask = tasks!.find(({ name }) => name === "helloGroovyCustom");
                assert.ok(groovyCustomTask);
                assert.strictEqual(groovyCustomTask.definition.project, "gradle-groovy-custom-build-file");
            });

            it("should successfully run a custom task", async () => {
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
                        await vscode.tasks.executeTask(task);
                    } catch (e) {
                        console.error("There was an error starting the task:", e.message);
                    }
                });
                assert.ok(spy.calledWith(sinon.match("Hello, World!")));
            });

            it("should refresh tasks", async () => {
                await vscode.commands.executeCommand(COMMAND_REFRESH);
                const task = (await vscode.tasks.fetchTasks({ type: "gradle" })).find(({ name }) => name === "hello");
                assert.ok(task);
            });
        });
    });
});
