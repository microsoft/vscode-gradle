import * as assert from "assert";
import * as vscode from "vscode";
import { Api } from "../../../api";

import { getSuiteName, EXTENSION_NAME } from "../../testUtil";
import { sleep } from "../../../util";

describe(getSuiteName("Extension"), () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let extension: vscode.Extension<Api> | undefined;

    before(() => {
        extension = vscode.extensions.getExtension(EXTENSION_NAME);
    });

    before(async () => {
        await vscode.workspace.getConfiguration("gradle").update("nestedProjects", false);
    });

    after(async () => {
        await vscode.workspace.getConfiguration("gradle").update("nestedProjects", false);
    });

    it("should be present", () => {
        assert.ok(extension);
    });

    it("should be activated", async () => {
        assert.ok(extension);
        await extension.activate();
        assert.strictEqual(extension.isActive, true);
    });

    async function fetchTasksUntilLoaded(expectedTaskNames: string[]): Promise<vscode.Task[]> {
        let tasks: vscode.Task[] = [];
        for (let i = 0; i < 5; i++) {
            tasks = await vscode.tasks.fetchTasks({ type: "gradle" });
            const loadedAll = expectedTaskNames.every((name) => tasks.some((task) => task.name === name));
            if (loadedAll) {
                break;
            }
            await sleep(5 * 1000);
        }
        return tasks;
    }

    describe("Task provider", () => {
        describe("With nestedProjects disabled and a non-Gradle workspace root", () => {
            it("should not load nested Gradle project tasks", async () => {
                const nestedTaskNames = ["helloGroovyDefault", "helloKotlinDefault", "helloGroovyCustom"];
                for (let i = 0; i < 5; i++) {
                    const tasks = await vscode.tasks.fetchTasks({ type: "gradle" });
                    assert.ok(nestedTaskNames.every((name) => !tasks.some((task) => task.name === name)));
                    if (i < 4) {
                        await sleep(5 * 1000);
                    }
                }
            });
        });

        describe("With nestedProjects:true setting", () => {
            let tasks: vscode.Task[] | undefined;

            before(async () => {
                await vscode.workspace.getConfiguration("gradle").update("nestedProjects", true);
            });

            beforeEach(async () => {
                tasks = await fetchTasksUntilLoaded(["helloGroovyDefault", "helloKotlinDefault", "helloGroovyCustom"]);
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
        });

        describe("With nestedProjects:[] setting", () => {
            let tasks: vscode.Task[] | undefined;

            before(async () => {
                await vscode.workspace
                    .getConfiguration("gradle")
                    .update("nestedProjects", ["gradle-groovy-default-build-file"]);
            });

            beforeEach(async () => {
                tasks = await vscode.tasks.fetchTasks({ type: "gradle" });
            });

            it("should load groovy default build file tasks", () => {
                const groovyDefaultTask = tasks!.find(({ name }) => name === "helloGroovyDefault");
                assert.ok(groovyDefaultTask);
                assert.strictEqual(groovyDefaultTask.definition.project, "gradle");
            });

            it("should not load kotlin default build file tasks", () => {
                const kotlinTask = tasks!.find(({ name }) => name === "helloKotlinDefault");
                assert.ok(!kotlinTask);
            });

            it("should not load groovy custom build file tasks", () => {
                const groovyCustomTask = tasks!.find(({ name }) => name === "helloGroovyCustom");
                assert.ok(!groovyCustomTask);
            });
        });
    });
});
