import * as vscode from "vscode";
import {
    TestRunner,
    TestItemStatusChangeEvent,
    TestFinishEvent,
    TestResultState,
    IRunTestContext,
    TestIdParts,
} from "../java-test-runner.api";
import { TaskServerClient } from "../client";
import { parseTestResults, TestCaseResult } from "./testResultParser";
import * as getPort from "get-port";
import { waitOnTcp } from "../util";
import * as os from "os";
import * as path from "path";

export class GradleTestRunner implements TestRunner {
    private readonly _onDidChangeTestItemStatus = new vscode.EventEmitter<TestItemStatusChangeEvent>();
    private readonly _onDidFinishTestRun = new vscode.EventEmitter<TestFinishEvent>();
    private context: IRunTestContext;
    private testRunnerApi: any;
    private testInitScriptPath: string;

    public onDidChangeTestItemStatus: vscode.Event<TestItemStatusChangeEvent> = this._onDidChangeTestItemStatus.event;
    public onDidFinishTestRun: vscode.Event<TestFinishEvent> = this._onDidFinishTestRun.event;

    constructor(testRunnerApi: any, private readonly client: TaskServerClient) {
        this.testRunnerApi = testRunnerApi;
        // Unique per-process, per-run suffix so concurrent runs / lingering files
        // from a previous VS Code session cannot collide or be picked up.
        this.testInitScriptPath = path.join(os.tmpdir(), `gradle-test-init-${process.pid}-${Date.now()}.gradle`);
    }

    public async launch(context: IRunTestContext): Promise<void> {
        this.context = context;

        // Build --tests filter arguments from test items, and collect the set of
        // classes under test so we can later match their result XML files.
        const testFilters: string[] = [];
        const classNames = new Set<string>();
        context.testItems.forEach((testItem) => {
            const id = testItem.id;
            const parts: TestIdParts = this.testRunnerApi.parsePartsFromTestId(id);
            if (!parts.class) {
                return;
            }
            classNames.add(parts.class);
            if (parts.invocations?.length) {
                let methodId = parts.invocations[0];
                if (methodId.includes("(")) {
                    methodId = methodId.slice(0, methodId.indexOf("("));
                }
                testFilters.push(`${parts.class}.${methodId}`);
            } else {
                testFilters.push(parts.class);
            }
        });

        if (testFilters.length === 0) {
            this.finishTestRun(0);
            return;
        }

        // Always run `cleanTest` before `test`. Gradle marks a Test task as
        // UP-TO-DATE when inputs haven't changed, which would skip execution and
        // NOT regenerate the JUnit XML report — we'd then parse stale or absent
        // XML and report nothing. `cleanTest` forces a fresh run; it's cheap
        // (just deletes the previous task outputs) and is the conventional fix.
        const gradleArgs: string[] = ["cleanTest", "test"];
        for (const filter of testFilters) {
            gradleArgs.push("--tests", filter);
        }

        const userArgs = context.testConfig?.args ?? [];
        gradleArgs.push(...userArgs);

        // Collect test JVM args and env vars. These cannot be passed on the
        // Gradle command line (that would affect the Gradle daemon, not the
        // forked test JVM), so we inject them into every Test task via an
        // init script.
        const vmArgs: string[] = (context.testConfig?.vmArgs ?? [])
            .map((a) => (typeof a === "string" ? a : String(a)))
            .filter((a) => a.length > 0);
        const envVars: Record<string, string> = context.testConfig?.env ?? {};

        const isDebug = context.isDebug && !!vscode.extensions.getExtension("vscjava.vscode-java-debug");
        let debugPort = -1;
        if (isDebug) {
            debugPort = await getPort();
        }

        const needsInitScript = isDebug || vmArgs.length > 0 || Object.keys(envVars).length > 0;
        let initScriptWritten = false;
        if (needsInitScript) {
            const initScriptContent = this.getInitScriptContent(debugPort, vmArgs, envVars);
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(this.testInitScriptPath),
                Buffer.from(initScriptContent)
            );
            initScriptWritten = true;
            gradleArgs.unshift("--init-script", this.testInitScriptPath);
        }

        const projectFolder = context.workspaceFolder.uri.fsPath;

        // Track the test ids we put into Running state so we can finalize them
        // if the run aborts before results come back (e.g. build crash, debug
        // attach failure). Without this, items are stuck as Running forever.
        const runningTestIds = new Set<string>();
        context.testItems.forEach((testItem) => {
            const id = testItem.id;
            const parts: TestIdParts = this.testRunnerApi.parsePartsFromTestId(id);
            if (parts.class) {
                const testId = this.testRunnerApi.parseTestIdFromParts({
                    project: context.projectName,
                    class: parts.class,
                    invocations: parts.invocations,
                });
                runningTestIds.add(testId);
                this._onDidChangeTestItemStatus.fire({
                    testId,
                    state: TestResultState.Running,
                });
            }
        });

        // Share a cancellation key between runBuild and the debug-attach path
        // so a failed attach can actively cancel the Gradle build (otherwise
        // the test JVM stays suspended waiting for a debugger that never comes).
        const cancellationKey = `gradleTestRun-${process.pid}-${Date.now()}`;

        // Start debug attachment concurrently — the init script sets suspend=y,
        // so the test JVM blocks until the debugger connects. We must start
        // waiting for the debug port BEFORE runBuild, otherwise it's a deadlock.
        if (isDebug) {
            this.startJavaDebug(debugPort).catch((err) => {
                // Fire-and-forget is not safe here: if the attach fails, the
                // test JVM will sit suspended forever, holding the build open.
                // Cancel the build so we surface a finite error to the user.
                this.client.cancelBuild(cancellationKey).catch(() => {
                    /* best-effort; runBuild will reject below */
                });
                console.error("[gradle-test] Failed to attach debugger:", err);
            });
        }

        // Captured just before runBuild so we can later ignore result XML files
        // left over from previous runs. Subtract a small slack to tolerate clock
        // skew between this process and the filesystem.
        const runStartTime = Date.now() - 2000;

        try {
            try {
                await this.client.runBuild(projectFolder, cancellationKey, gradleArgs, "", isDebug ? debugPort : 0);

                // Parse JUnit XML results and emit status events
                const results = await parseTestResults(context.workspaceFolder, {
                    classNames,
                    minMtime: runStartTime,
                });
                this.emitTestResults(results, runningTestIds);
                this.finalizePendingItems(runningTestIds);
                this.finishTestRun(0);
            } catch (error) {
                // Gradle exits with non-zero when tests fail — still parse results
                let parsedAny = false;
                try {
                    const results = await parseTestResults(context.workspaceFolder, {
                        classNames,
                        minMtime: runStartTime,
                    });
                    if (results.length > 0) {
                        this.emitTestResults(results, runningTestIds);
                        parsedAny = true;
                    }
                } catch {
                    // fall through to error path
                }
                // Finalize any items that never got a result so they don't
                // remain stuck in Running.
                this.finalizePendingItems(runningTestIds);
                if (parsedAny) {
                    this.finishTestRun(0);
                } else {
                    this.finishTestRun(1, error.message || "Gradle test execution failed");
                }
            }
        } finally {
            // Best-effort cleanup of the per-run init script. Safe if it was
            // never written (the fs call will just reject and we swallow it).
            if (initScriptWritten) {
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.file(this.testInitScriptPath));
                } catch {
                    /* best-effort */
                }
            }
        }
    }

    /**
     * Emit results for tests we have XML for, and remove those ids from the
     * pending set so {@link finalizePendingItems} knows what's still unresolved.
     */
    private emitTestResults(results: TestCaseResult[], pending?: Set<string>): void {
        for (const result of results) {
            let message = result.message;
            if (message) {
                message = this.filterStackTrace(message);
            }
            const testId = this.testRunnerApi.parseTestIdFromParts({
                project: this.context.projectName,
                class: result.className,
                invocations: [result.methodName],
            });
            pending?.delete(testId);
            this._onDidChangeTestItemStatus.fire({
                testId,
                state: result.state,
                displayName: result.displayName,
                message,
                duration: result.duration,
            });
        }
    }

    /**
     * Any test id that we marked Running but never received a result for is
     * transitioned to Errored with an explanatory message. Without this, test
     * items would be stuck with a spinner indefinitely whenever the build
     * fails before producing reports (compile error, cancellation, crash).
     */
    private finalizePendingItems(pending: Set<string>): void {
        for (const testId of pending) {
            this._onDidChangeTestItemStatus.fire({
                testId,
                state: TestResultState.Errored,
                message: "No test result was reported for this item (build may have failed before tests ran).",
            });
        }
        pending.clear();
    }

    public finishTestRun(statusCode: number, message?: string): void {
        this._onDidFinishTestRun.fire({
            statusCode,
            message,
        });
    }

    private filterStackTrace(stackTrace: string): string {
        const filterElements = this.getStacktraceFilterElements();
        return stackTrace
            .split("\n")
            .filter((line) => filterElements.every((filterElement) => !line.includes(filterElement)))
            .join("\n");
    }

    private getStacktraceFilterElements(): string[] {
        return [
            // junit 5
            "junit.framework.TestCase",
            "junit.framework.TestResult",
            "junit.framework.TestResult$1",
            "junit.framework.TestSuite",
            "junit.framework.Assert",
            // junit 4
            "org.junit.",
            // testng
            "org.testng.internal.",
            "org.testng.TestRunner",
            "org.testng.SuiteRunner",
            "org.testng.TestNG",
            "org.testng.Assert",
            // jdk
            "java.lang.reflect.Method.invoke",
            "sun.reflect.",
            "jdk.internal.reflect.",
            "jdk.proxy",
            // gradle
            "org.gradle.api.internal.tasks.testing.",
            "org.gradle.internal.dispatch.",
            "org.gradle.process.internal.",
            "worker.org.gradle.process.internal.",
        ];
    }

    private async startJavaDebug(javaDebugPort: number): Promise<void> {
        if (javaDebugPort < 0) {
            return;
        }

        await waitOnTcp("localhost", javaDebugPort);
        const debugConfig = {
            type: "java",
            name: "Debug (Attach) via Gradle",
            request: "attach",
            hostName: "localhost",
            port: javaDebugPort,
            projectName: this.context.projectName,
        };
        const startedDebugging = await vscode.debug.startDebugging(this.context.workspaceFolder, debugConfig);
        if (!startedDebugging) {
            throw new Error("The debugger was not started");
        }
    }

    /**
     * Builds the Gradle init script that configures every Test task in the
     * build with the user's JVM args, environment variables, and (optionally)
     * the debug agent.
     *
     * We use an init script (rather than command-line flags) because:
     *  - `-Dorg.gradle.jvmargs=...` only configures the Gradle daemon, not the
     *    forked test JVM.
     *  - Gradle Tooling API's `TestLauncher.debugTestsOn()` does not support
     *    `server=y` mode, which we need so the test JVM waits for the debugger.
     *    See: https://docs.gradle.org/current/javadoc/org/gradle/tooling/TestLauncher.html#debugTestsOn(int)
     *
     * Note: when multiple test tasks are executed in one build invocation with
     * debug enabled, there is a race for the debug port. If this becomes a
     * problem, we could scope the debug agent by project root path.
     */
    private getInitScriptContent(debugPort: number, vmArgs: string[], envVars: Record<string, string>): string {
        const lines: string[] = ["allprojects {", "    tasks.withType(Test).configureEach {"];
        for (const arg of vmArgs) {
            lines.push(`        jvmArgs '${escapeGroovySingleQuoted(arg)}'`);
        }
        for (const [key, value] of Object.entries(envVars)) {
            lines.push(`        environment '${escapeGroovySingleQuoted(key)}', '${escapeGroovySingleQuoted(value)}'`);
        }
        if (debugPort > 0) {
            lines.push(`        jvmArgs '-agentlib:jdwp=transport=dt_socket,server=y,address=${debugPort},suspend=y'`);
        }
        lines.push("    }", "}");
        return lines.join("\n");
    }
}

/**
 * Escape a string so it can be embedded inside a Groovy single-quoted literal.
 * Only backslashes and single quotes need escaping.
 */
function escapeGroovySingleQuoted(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
