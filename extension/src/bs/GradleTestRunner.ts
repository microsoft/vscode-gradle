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

/** Build server status codes, as reported by BSP's `StatusCode`. */
const STATUS_CODE_OK = 1;
const STATUS_CODE_ERROR = 2;
const STATUS_CODE_CANCELLED = 3;

interface ActiveRun {
    readonly id: number;
    readonly originId: string;
    reported: boolean;
}

export class GradleTestRunner implements TestRunner {
    private readonly _onDidChangeTestItemStatus = new vscode.EventEmitter<TestItemStatusChangeEvent>();
    private readonly _onDidFinishTestRun = new vscode.EventEmitter<TestFinishEvent>();
    private testRunnerApi: any;
    private bspContext: IRunTestContext | undefined;
    /** Resolves once the run in flight has been reported as finished. See {@link launch}. */
    private runChain: Promise<void> = Promise.resolve();
    private activeRun: ActiveRun | undefined;
    private runCounter = 0;

    public onDidChangeTestItemStatus: vscode.Event<TestItemStatusChangeEvent> = this._onDidChangeTestItemStatus.event;
    public onDidFinishTestRun: vscode.Event<TestFinishEvent> = this._onDidFinishTestRun.event;

    constructor(testRunnerApi: any, private readonly client: TaskServerClient) {
        this.testRunnerApi = testRunnerApi;
    }

    /**
     * Runs one test run, once every run requested before it has finished.
     *
     * Test results and completion arrive from the build server through
     * extension-wide commands that carry no run identity, and are resolved
     * against the single run this class tracks. Two overlapping runs would
     * therefore report into each other's test items, so runs are queued instead
     * of interleaved.
     */
    public async launch(context: IRunTestContext): Promise<void> {
        const predecessor = this.runChain;
        const current = predecessor.then(
            () => this.runQueued(context),
            () => this.runQueued(context)
        );
        // The queue has to survive a failed run, otherwise one failure would block
        // every run after it.
        this.runChain = current.catch(() => undefined);
        return current;
    }

    private async runQueued(context: IRunTestContext): Promise<void> {
        const runId = this.beginRun(context);
        try {
            if (context.cancellationToken?.isCancellationRequested) {
                // Cancelled while queued behind an earlier run, so nothing was launched.
                this.reportFinished(runId, STATUS_CODE_CANCELLED);
                return;
            }
            const statusCode = await this.doLaunch(context);
            // The build server reports a run as finished only once it has actually
            // started one, so a request that ends without a report still has to end
            // the run. Reporting is idempotent, so the build server's own report wins
            // whenever it arrives.
            this.reportFinished(runId, statusCode);
        } catch (error) {
            this.reportFinished(runId, STATUS_CODE_ERROR, getErrorMessage(error));
        } finally {
            this.endRun(runId);
        }
    }

    private async doLaunch(context: IRunTestContext): Promise<number> {
        try {
            return await this.launchWithBsp(context);
        } catch (error) {
            if (!isBspUnavailableError(error)) {
                throw error;
            }
            await this.launchXmlFallback(context);
            return STATUS_CODE_OK;
        }
    }

    private beginRun(context: IRunTestContext): number {
        const id = ++this.runCounter;
        this.activeRun = { id, originId: `vscode-gradle-test-${id}-${Date.now()}`, reported: false };
        this.bspContext = context;
        return id;
    }

    private endRun(id: number): void {
        if (this.activeRun?.id === id) {
            this.activeRun = undefined;
            // Reports that arrive after a run has ended belong to nothing, and
            // {@link updateTestItem} drops them for want of a context to resolve against.
            this.bspContext = undefined;
        }
    }

    /**
     * Reports a run as finished, at most once.
     *
     * The build server's report and the end of the request race each other, and a
     * report belonging to a run that has already ended must never close the run
     * that replaced it.
     */
    private reportFinished(id: number, statusCode: number, message?: string): void {
        if (this.activeRun?.id !== id || this.activeRun.reported) {
            return;
        }
        this.activeRun.reported = true;
        this._onDidFinishTestRun.fire({
            statusCode,
            message,
        });
    }

    public updateTestItem(
        testParts: string[],
        state: number,
        displayName?: string,
        message?: string,
        duration?: number
    ): void {
        if (!this.bspContext) {
            return;
        }
        if (message) {
            message = this.filterStackTrace(message);
        }
        const testId = this.testRunnerApi.parseTestIdFromParts({
            project: this.bspContext.projectName,
            class: testParts[0],
            invocations: testParts.slice(1),
        });
        this._onDidChangeTestItemStatus.fire({
            testId,
            state,
            displayName,
            message,
            duration,
        });
    }

    private async launchWithBsp(context: IRunTestContext): Promise<number> {
        const tests: Map<string, string[]> = new Map();
        context.testItems.forEach((testItem) => {
            const id = testItem.id;
            const parts: TestIdParts = this.testRunnerApi.parsePartsFromTestId(id);
            if (!parts.class) {
                return;
            }
            const testMethods = tests.get(parts.class) || [];
            if (parts.invocations?.length) {
                testMethods.push(normalizeTestMethodName(parts.invocations[0]));
            }
            tests.set(parts.class, testMethods);
        });

        const args = [...(context.testConfig?.args ?? [])];
        const vmArgs = context.testConfig?.vmArgs;
        const env = context.testConfig?.env;
        const isDebug = context.isDebug && !!vscode.extensions.getExtension("vscjava.vscode-java-debug");
        let debugPort = -1;
        let testInitScriptPath: string | undefined;
        if (isDebug) {
            debugPort = await getPort();
            testInitScriptPath = createInitScriptPath();
            const initScriptContent = this.getInitScriptContent(debugPort, [], {});
            await vscode.workspace.fs.writeFile(vscode.Uri.file(testInitScriptPath), Buffer.from(initScriptContent));
            args.unshift("--init-script", testInitScriptPath);
        }

        try {
            // The debugger has to be attached while the run is in flight: the request
            // below now completes only once the tests are over, and the test JVM is
            // waiting on the debug port until something connects to it.
            const request = vscode.commands.executeCommand<number | null>(
                "java.execute.workspaceCommand",
                "java.gradle.delegateTest",
                context.projectName,
                JSON.stringify([...tests]),
                args,
                vmArgs,
                env,
                this.activeRun?.originId
            );
            if (isDebug) {
                this.startJavaDebug(context, debugPort).catch((err) => {
                    console.error("[gradle-test] Failed to attach debugger:", err);
                });
            }
            const statusCode = await request;
            return typeof statusCode === "number" ? statusCode : STATUS_CODE_OK;
        } finally {
            if (testInitScriptPath) {
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.file(testInitScriptPath));
                } catch {
                    /* best-effort */
                }
            }
        }
    }

    private async launchXmlFallback(context: IRunTestContext): Promise<void> {
        // Build --tests filter arguments from test items, and collect the set of
        // classes under test so we can later match their result XML files.
        const testFilters: string[] = [];
        const classNames = new Set<string>();
        const requestedTestIdsByResultKey = new Map<string, string>();
        const requestedClassTestIds = new Map<string, string>();
        context.testItems.forEach((testItem) => {
            const id = testItem.id;
            const parts: TestIdParts = this.testRunnerApi.parsePartsFromTestId(id);
            if (!parts.class) {
                return;
            }
            classNames.add(parts.class);
            if (parts.invocations?.length) {
                const methodId = normalizeTestMethodName(parts.invocations[0]);
                const testId = this.testRunnerApi.parseTestIdFromParts({
                    project: context.projectName,
                    class: parts.class,
                    invocations: parts.invocations,
                });
                requestedTestIdsByResultKey.set(resultKey(parts.class, methodId), testId);
                testFilters.push(`${parts.class}.${methodId}`);
            } else {
                const testId = this.testRunnerApi.parseTestIdFromParts({
                    project: context.projectName,
                    class: parts.class,
                });
                requestedClassTestIds.set(parts.class, testId);
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
        // Unique per launch so overlapping run/debug sessions never share the
        // same init script contents or cleanup target.
        const testInitScriptPath = createInitScriptPath();
        if (needsInitScript) {
            const initScriptContent = this.getInitScriptContent(debugPort, vmArgs, envVars);
            await vscode.workspace.fs.writeFile(vscode.Uri.file(testInitScriptPath), Buffer.from(initScriptContent));
            initScriptWritten = true;
            gradleArgs.unshift("--init-script", testInitScriptPath);
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
            this.startJavaDebug(context, debugPort).catch((err) => {
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
                this.emitTestResults(
                    context,
                    results,
                    runningTestIds,
                    requestedTestIdsByResultKey,
                    requestedClassTestIds
                );
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
                        this.emitTestResults(
                            context,
                            results,
                            runningTestIds,
                            requestedTestIdsByResultKey,
                            requestedClassTestIds
                        );
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
                    this.finishTestRun(1, getErrorMessage(error));
                }
            }
        } finally {
            // Best-effort cleanup of the per-run init script. Safe if it was
            // never written (the fs call will just reject and we swallow it).
            if (initScriptWritten) {
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.file(testInitScriptPath));
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
    private emitTestResults(
        context: IRunTestContext,
        results: TestCaseResult[],
        pending: Set<string> | undefined,
        requestedTestIdsByResultKey: ReadonlyMap<string, string>,
        requestedClassTestIds: ReadonlyMap<string, string>
    ): void {
        const requestedClassStates = new Map<string, TestResultState>();
        for (const result of results) {
            let message = result.message;
            if (message) {
                message = this.filterStackTrace(message);
            }
            const normalizedMethodName = normalizeTestMethodName(result.methodName);
            const testId =
                requestedTestIdsByResultKey.get(resultKey(result.className, normalizedMethodName)) ??
                this.testRunnerApi.parseTestIdFromParts({
                    project: context.projectName,
                    class: result.className,
                    invocations: [result.methodName],
                });
            pending?.delete(testId);
            const classTestId = findMatchingRequestedClassTestId(result.className, requestedClassTestIds);
            if (classTestId) {
                pending?.delete(classTestId);
                requestedClassStates.set(
                    classTestId,
                    mergeTestResultState(requestedClassStates.get(classTestId), result.state)
                );
            }
            this._onDidChangeTestItemStatus.fire({
                testId,
                state: result.state,
                displayName: result.displayName,
                message,
                duration: result.duration,
            });
        }
        for (const [testId, state] of requestedClassStates) {
            this._onDidChangeTestItemStatus.fire({
                testId,
                state,
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

    public finishTestRun(statusCode: number, message?: string, originId?: string): void {
        if (!this.activeRun) {
            return;
        }
        if (originId && originId !== this.activeRun.originId) {
            // A report for a run that has already ended. Closing the run that replaced
            // it would report someone else's result and cut its tests short.
            return;
        }
        this.reportFinished(this.activeRun.id, statusCode, message);
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

    private async startJavaDebug(context: IRunTestContext, javaDebugPort: number): Promise<void> {
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
            projectName: context.projectName,
        };
        const startedDebugging = await vscode.debug.startDebugging(context.workspaceFolder, debugConfig);
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
     * Debug is intentionally serialized: every forked test JVM would otherwise
     * try to bind the same JDWP port. We allow the first Test task to run and
     * fail fast if the same Gradle invocation reaches another Test task.
     */
    private getInitScriptContent(debugPort: number, vmArgs: string[], envVars: Record<string, string>): string {
        const lines: string[] = [];
        if (debugPort > 0) {
            lines.push(
                "gradle.startParameter.parallelProjectExecutionEnabled = false",
                "gradle.ext.vscodeGradleDebugTestTaskPath = null"
            );
        }
        lines.push("allprojects {", "    tasks.withType(Test).configureEach {");
        for (const arg of vmArgs) {
            lines.push(`        jvmArgs '${escapeGroovySingleQuoted(arg)}'`);
        }
        for (const [key, value] of Object.entries(envVars)) {
            lines.push(`        environment '${escapeGroovySingleQuoted(key)}', '${escapeGroovySingleQuoted(value)}'`);
        }
        if (debugPort > 0) {
            lines.push("        maxParallelForks = 1");
            lines.push("        doFirst {");
            lines.push("            if (gradle.ext.vscodeGradleDebugTestTaskPath == null) {");
            lines.push("                gradle.ext.vscodeGradleDebugTestTaskPath = path");
            lines.push("            } else if (gradle.ext.vscodeGradleDebugTestTaskPath != path) {");
            lines.push(
                "                throw new GradleException('Debugging multiple Gradle Test tasks in one delegated run is not supported. Please debug a single test class or method.')"
            );
            lines.push("            }");
            lines.push("        }");
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

function normalizeTestMethodName(methodName: string): string {
    const trimmed = methodName.trim();
    const signatureStart = trimmed.indexOf("(");
    if (signatureStart > 0) {
        return trimmed.slice(0, signatureStart);
    }
    const parameterizedSuffixStart = trimmed.indexOf("[");
    if (parameterizedSuffixStart > 0) {
        return trimmed.slice(0, parameterizedSuffixStart);
    }
    return trimmed;
}

function resultKey(className: string, methodName: string): string {
    return `${className}#${methodName}`;
}

function findMatchingRequestedClassTestId(
    resultClassName: string,
    requestedClassTestIds: ReadonlyMap<string, string>
): string | undefined {
    const exactMatch = requestedClassTestIds.get(resultClassName);
    if (exactMatch) {
        return exactMatch;
    }
    for (const [requestedClassName, testId] of requestedClassTestIds) {
        if (resultClassName.startsWith(requestedClassName + "$")) {
            return testId;
        }
    }
    return undefined;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : "Gradle test execution failed";
}

function isBspUnavailableError(error: unknown): boolean {
    const message = getErrorMessage(error);
    return (
        message.includes("Project is not a Gradle build server project") ||
        message.includes("GradleBuildServerProjectNature") ||
        (message.includes("java.gradle.delegateTest") &&
            (message.includes("not found") || message.includes("Unknown command") || message.includes("unsupported")))
    );
}

function createInitScriptPath(): string {
    return path.join(
        os.tmpdir(),
        `gradle-test-init-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.gradle`
    );
}

function mergeTestResultState(current: TestResultState | undefined, next: TestResultState): TestResultState {
    if (!current) {
        return next;
    }
    if (current === TestResultState.Errored || next === TestResultState.Errored) {
        return TestResultState.Errored;
    }
    if (current === TestResultState.Failed || next === TestResultState.Failed) {
        return TestResultState.Failed;
    }
    if (current === TestResultState.Passed || next === TestResultState.Passed) {
        return TestResultState.Passed;
    }
    return TestResultState.Skipped;
}
