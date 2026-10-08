import * as assert from "assert";
import * as path from "path";
import * as fs from "fs-extra";
import * as vscode from "vscode";
import { Api } from "../../../api";
import { getGradleServerEnv } from "../../../server/serverUtil";
import { sleep } from "../../../util";
import { GradleTaskTreeItem } from "../../../views";
import { EXTENSION_NAME, getSuiteName } from "../../testUtil";

interface JavaExtensionApi {
    serverReady(): Promise<boolean>;
    getProjectSettings(uri: string, keys: string[]): Promise<Record<string, string>>;
}

async function bounded<T>(promise: PromiseLike<T>, description: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), 240000);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

async function waitFor<T>(read: () => Promise<T | undefined>, description: string): Promise<T> {
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
        const value = await read();
        if (value !== undefined) {
            return value;
        }
        await sleep(1000);
    }
    throw new Error(`Timed out: ${description}`);
}

describe(getSuiteName("Live Java 27 compatibility"), () => {
    let api: Api;
    let fixture: string;

    before(async () => {
        const extension = vscode.extensions.getExtension<Api>(EXTENSION_NAME);
        assert.ok(extension);
        assert.ok(vscode.workspace.workspaceFolders?.[0]);
        fixture = vscode.workspace.workspaceFolders[0].uri.fsPath;
        api = await bounded(extension.activate(), "Gradle extension activation");
    });

    async function runTask(taskName: string, args: string[] = []): Promise<string> {
        let output = "";
        const decoder = new TextDecoder();
        await bounded(
            api.runTask({
                projectFolder: fixture,
                taskName,
                args,
                showOutputColors: false,
                onOutput: (chunk) => {
                    output += decoder.decode(chunk.getOutputBytes_asU8(), { stream: true });
                },
            }),
            taskName
        );
        output += decoder.decode();
        assert.match(output, /BUILD SUCCESSFUL/);
        return output;
    }

    it("discovers tasks and runs Gradle 9.8.1 on the selected daemon JVM", async () => {
        await waitFor(async () => {
            const tasks = await vscode.tasks.fetchTasks({ type: "gradle" });
            return ["runtimeInfo", "run", "test"].every((name) => tasks.some((task) => task.name === name))
                ? tasks
                : undefined;
        }, "task discovery");
        const env = await getGradleServerEnv();
        assert.ok(env?.VSCODE_JAVA_HOME);
        assert.ok(process.env.COMPATIBILITY_DAEMON_HOME);
        assert.strictEqual(
            await fs.realpath(env.VSCODE_JAVA_HOME),
            await fs.realpath(process.env.COMPATIBILITY_DAEMON_HOME)
        );
        const output = await runTask("runtimeInfo");
        assert.match(output, /GRADLE_VERSION=9\.8\.1/);
        assert.ok(output.includes(`DAEMON_JAVA_VERSION=${process.env.COMPATIBILITY_DAEMON_VERSION}`), output);
    });

    it("imports through BSP with Java 27 source, target and project runtime", async () => {
        const java = vscode.extensions.getExtension<JavaExtensionApi>("redhat.java");
        assert.ok(java);
        const javaApi = await bounded(java.activate(), "Java extension activation");
        assert.strictEqual(await bounded(javaApi.serverReady(), "Java language server readiness"), true);
        await waitFor(async () => {
            const classpath = path.join(fixture, ".classpath");
            if (!(await fs.pathExists(classpath))) {
                return undefined;
            }
            const contents = await fs.readFile(classpath, "utf8");
            return contents.includes('name="gradle.buildServer"') ? contents : undefined;
        }, "BSP classpath import");
        const sourceKey = "org.eclipse.jdt.core.compiler.source";
        const targetKey = "org.eclipse.jdt.core.compiler.codegen.targetPlatform";
        const vmKey = "org.eclipse.jdt.ls.core.vm.location";
        const settings = await javaApi.getProjectSettings(
            vscode.Uri.file(path.join(fixture, "src", "main", "java", "compatibility", "App.java")).toString(),
            [sourceKey, targetKey, vmKey]
        );
        assert.strictEqual(settings[sourceKey], "27");
        assert.strictEqual(settings[targetKey], "27");
        assert.ok(process.env.JDK27_HOME);
        assert.strictEqual(await fs.realpath(settings[vmKey]), await fs.realpath(process.env.JDK27_HOME));
    });

    it("retrieves the real dependency model", async () => {
        const tree = api.getTasksTreeProvider();
        const roots = await tree.getChildren();
        const project = roots.find((item) => item.label === "gradle-java27");
        assert.ok(project, roots.map((item) => item.label).join(", "));
        const dependencies = (await tree.getChildren(project)).find((item) => item.label === "Dependencies");
        assert.ok(dependencies);
        const configuration = await waitFor(async () => {
            const items = await tree.getChildren(dependencies);
            assert.ok(!items.some((item) => item.label === "Failed to load dependencies"));
            return items.find((item) => item.label === "testRuntimeClasspath");
        }, "dependency model");
        const libraries = await tree.getChildren(configuration);
        assert.ok(
            libraries.some((item) => typeof item.label === "string" && /junit.*4\.13\.2/.test(item.label)),
            libraries.map((item) => item.label).join(", ")
        );
    });

    async function assertTestResults(): Promise<void> {
        const xml = await fs.readFile(
            path.join(fixture, "build", "test-results", "test", "TEST-compatibility.AppTest.xml"),
            "utf8"
        );
        assert.match(xml, /tests="1"/);
        assert.match(xml, /failures="0"/);
        assert.match(xml, /errors="0"/);
        assert.match(xml, /name="usesJava27"/);
    }

    it("executes JavaExec and JUnit using the Java 27 toolchain", async () => {
        assert.match(await runTask("run"), /JAVA_FEATURE=27/);
        await runTask("test", ["--rerun-tasks"]);
        await assertTestResults();
    });

    async function debugTask(name: string, source: string, marker: string): Promise<void> {
        const task = (await vscode.tasks.fetchTasks({ type: "gradle" })).find((candidate) => candidate.name === name);
        assert.ok(task);
        const file = path.join(fixture, source);
        const line = (await fs.readFile(file, "utf8")).split(/\r?\n/).findIndex((text) => text.includes(marker));
        assert.ok(line >= 0);
        const breakpoint = new vscode.SourceBreakpoint(
            new vscode.Location(vscode.Uri.file(file), new vscode.Position(line, 0))
        );
        vscode.debug.addBreakpoints([breakpoint]);
        let session: vscode.DebugSession | undefined;
        let execution: vscode.TaskExecution | undefined;
        let completed = false;
        let stopped!: (value: { session: vscode.DebugSession; threadId: number }) => void;
        let failed!: (error: unknown) => void;
        const hit = new Promise<{ session: vscode.DebugSession; threadId: number }>((resolve, reject) => {
            stopped = resolve;
            failed = reject;
        });
        const tracker = vscode.debug.registerDebugAdapterTrackerFactory("java", {
            createDebugAdapterTracker: (candidate) => {
                session = candidate;
                return {
                    onError: failed,
                    onDidSendMessage: (message: {
                        type: string;
                        event?: string;
                        body?: { reason?: string; threadId?: number };
                    }) => {
                        if (
                            message.type === "event" &&
                            message.event === "stopped" &&
                            message.body?.reason === "breakpoint"
                        ) {
                            if (message.body.threadId === undefined) {
                                failed(new Error("Breakpoint event did not identify its thread"));
                                return;
                            }
                            stopped({ session: candidate, threadId: message.body.threadId });
                        }
                    },
                };
            },
        });
        const start = vscode.tasks.onDidStartTask((event) => {
            if (
                event.execution.task.definition.javaDebug &&
                event.execution.task.definition.script === task.definition.script
            ) {
                execution = event.execution;
            }
        });
        let finish!: (code: number | undefined) => void;
        const ended = new Promise<number | undefined>((resolve) => {
            finish = resolve;
        });
        const end = vscode.tasks.onDidEndTaskProcess((event) => {
            if (
                event.execution.task.definition.javaDebug &&
                event.execution.task.definition.script === task.definition.script
            ) {
                completed = true;
                finish(event.exitCode);
            }
        });
        try {
            const item = new GradleTaskTreeItem(
                new vscode.TreeItem("parent"),
                task,
                task.name,
                "",
                task.definition.description,
                api.getIcons(),
                false
            );
            // Keep task arguments separate from the command registration's extra parameters.
            await vscode.commands.executeCommand("gradle.debugTask", item, "");
            const paused = await bounded(
                Promise.race([
                    hit,
                    ended.then((code) => {
                        throw new Error(`${name} exited ${code} before hitting the breakpoint`);
                    }),
                ]),
                `${name} debugger breakpoint`
            );
            const stack: { stackFrames: { id: number; source?: { path?: string }; line: number }[] } =
                await paused.session.customRequest("stackTrace", {
                    threadId: paused.threadId,
                    startFrame: 0,
                    levels: 1,
                });
            const frame = stack.stackFrames[0];
            assert.ok(frame?.source?.path);
            assert.strictEqual(await fs.realpath(frame.source.path), await fs.realpath(file));
            assert.strictEqual(frame.line, line + 1);
            const value: { result: string } = await paused.session.customRequest("evaluate", {
                expression: "feature",
                context: "watch",
                frameId: frame.id,
            });
            assert.strictEqual(value.result, "27");
            await paused.session.customRequest("continue", { threadId: paused.threadId });
            assert.strictEqual(await bounded(ended, `${name} debug task completion`), 0);
        } finally {
            start.dispose();
            end.dispose();
            tracker.dispose();
            vscode.debug.removeBreakpoints([breakpoint]);
            if (session) {
                await vscode.debug.stopDebugging(session);
            }
            if (!completed) {
                execution?.terminate();
            }
        }
    }

    it("hits a real JavaExec breakpoint in a Java 27 debuggee", async () => {
        await debugTask("run", path.join("src", "main", "java", "compatibility", "App.java"), "System.out.println");
    });

    it("hits a real JUnit breakpoint in a Java 27 debuggee", async () => {
        await debugTask("test", path.join("src", "test", "java", "compatibility", "AppTest.java"), "assertEquals(27");
        await assertTestResults();
    });
});
