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
import {
    CoverageDescriptor,
    CoverageSourceRoot,
    JACOCO_REPORT_TASK,
    collectCoverage,
    createCoverageDescriptor,
    getCoverageInitScriptLines,
} from "./coverage";
import { escapeGroovySingleQuoted } from "./groovy";
import * as getPort from "get-port";
import { waitOnTcp } from "../util";
import * as os from "os";
import * as path from "path";

export class GradleTestRunner implements TestRunner {
    private readonly _onDidChangeTestItemStatus = new vscode.EventEmitter<TestItemStatusChangeEvent>();
    private readonly _onDidFinishTestRun = new vscode.EventEmitter<TestFinishEvent>();
    private testRunnerApi: any;
    private bspContext: IRunTestContext | undefined;
    private pendingCoverageRun: PendingCoverageRun | undefined;
    // BSP callbacks have no run id, so delegated runs must be serialized.
    private runChain: Promise<void> = Promise.resolve();
    private releaseGate: (() => void) | undefined;

    public onDidChangeTestItemStatus: vscode.Event<TestItemStatusChangeEvent> = this._onDidChangeTestItemStatus.event;
    public onDidFinishTestRun: vscode.Event<TestFinishEvent> = this._onDidFinishTestRun.event;

    constructor(testRunnerApi: any, private readonly client: TaskServerClient) {
        this.testRunnerApi = testRunnerApi;
    }

    public async launch(context: IRunTestContext): Promise<void> {
        const previous = this.runChain;
        let resolveChain!: () => void;
        this.runChain = new Promise<void>((resolve) => (resolveChain = resolve));
        try {
            await previous;
        } catch {
            // Continue after a failed prior run.
        }
        let released = false;
        const release = () => {
            if (released) {
                return;
            }
            released = true;
            if (this.releaseGate === release) {
                this.releaseGate = undefined;
            }
            resolveChain();
        };
        this.releaseGate = release;
        try {
            await this.doLaunch(context);
        } catch (error) {
            release();
            throw error;
        }
    }

    private async doLaunch(context: IRunTestContext): Promise<void> {
        if (isCoverageRun(context)) {
            const buildInfo = await this.getBuildTargetInfo(context.projectName);
            const gradleVersion = buildInfo.gradleVersion ?? (await getWrapperGradleVersion(context));
            const compatibilityError = getCoverageCompatibilityError(gradleVersion);
            if (compatibilityError) {
                this.finishTestRun(2, compatibilityError);
                return;
            }
            try {
                await this.launchCoverageWithBsp(context, buildInfo.sourceRoots);
            } catch (error) {
                if (!isBspUnavailableError(error)) {
                    this.finishTestRun(-1, getErrorMessage(error));
                    return;
                }
                await this.launchViaTaskServer(context);
            }
            return;
        }
        try {
            await this.launchWithBsp(context);
        } catch (error) {
            if (!isBspUnavailableError(error)) {
                this.finishTestRun(-1, getErrorMessage(error));
                return;
            }
            await this.launchViaTaskServer(context);
        }
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

    private async launchWithBsp(context: IRunTestContext): Promise<void> {
        this.bspContext = context;
        const tests = this.buildTestsMap(context);

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
            await vscode.commands.executeCommand(
                "java.execute.workspaceCommand",
                "java.gradle.delegateTest",
                context.projectName,
                JSON.stringify([...tests]),
                args,
                vmArgs,
                env
            );
            if (isDebug) {
                this.startJavaDebug(context, debugPort).catch((err) => {
                    console.error("[gradle-test] Failed to attach debugger:", err);
                });
            }
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

    /**
     * Group the requested test items into a `class -> [methods]` map, as the
     * BSP delegate command expects. A class with no listed methods runs all of
     * its tests.
     */
    private buildTestsMap(context: IRunTestContext): Map<string, string[]> {
        const tests: Map<string, string[]> = new Map();
        context.testItems.forEach((testItem) => {
            const parts: TestIdParts = this.testRunnerApi.parsePartsFromTestId(testItem.id);
            if (!parts.class) {
                return;
            }
            const testMethods = tests.get(parts.class) || [];
            if (parts.invocations?.length) {
                testMethods.push(normalizeTestMethodName(parts.invocations[0]));
            }
            tests.set(parts.class, testMethods);
        });
        return tests;
    }

    private async launchCoverageWithBsp(context: IRunTestContext, sourceRoots: CoverageSourceRoot[]): Promise<void> {
        this.bspContext = context;
        const tests = this.buildTestsMap(context);

        const coverage = createCoverageDescriptor();
        const initScriptPath = createInitScriptPath();
        const initScriptContent = this.getInitScriptContent(-1, [], {}, coverage);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(initScriptPath), Buffer.from(initScriptContent));

        const args = [...(context.testConfig?.args ?? [])];
        args.unshift("--init-script", initScriptPath);
        const vmArgs = context.testConfig?.vmArgs;
        const env = context.testConfig?.env;

        this.pendingCoverageRun = {
            descriptor: coverage,
            initScriptPath,
            context,
            sourceRoots,
        };

        try {
            await vscode.commands.executeCommand(
                "java.execute.workspaceCommand",
                "java.gradle.delegateTest",
                context.projectName,
                JSON.stringify([...tests]),
                args,
                vmArgs,
                env
            );
        } catch (error) {
            await this.discardPendingCoverageRun();
            throw error;
        }
    }

    private async finalizePendingCoverageRun(
        pending: PendingCoverageRun,
        statusCode: number,
        message?: string
    ): Promise<void> {
        try {
            await this.collectCoverageIfNeeded(pending.context, pending.descriptor, pending.sourceRoots);
        } finally {
            await this.cleanupCoverageArtifacts(pending);
            this.emitFinish(statusCode, message);
        }
    }

    private async cleanupCoverageArtifacts(pending: PendingCoverageRun): Promise<void> {
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(pending.initScriptPath));
        } catch {
            /* best-effort */
        }
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(pending.descriptor.rootDir), {
                recursive: true,
                useTrash: false,
            });
        } catch {
            /* best-effort */
        }
    }

    private async discardPendingCoverageRun(): Promise<void> {
        const pending = this.pendingCoverageRun;
        if (!pending) {
            return;
        }
        this.pendingCoverageRun = undefined;
        await this.cleanupCoverageArtifacts(pending);
    }

    /**
     * Run tests through the Gradle task server (`cleanTest test --tests …`,
     * plus `jacocoTestReport` for coverage), parsing JUnit XML for results.
     *
     * This is used in two situations: as the fallback when the BSP delegate is
     * unavailable (any run kind), and — historically — as the coverage path.
     * Coverage now prefers {@link launchCoverageWithBsp}; this remains its
     * fallback. It still handles coverage inline so the fallback keeps working.
     */
    private async launchViaTaskServer(context: IRunTestContext): Promise<void> {
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

        // When this is a Coverage run, inject JaCoCo via the init script and run
        // the report task in the same invocation so we can translate its output
        // back into VS Code coverage. The report task must come after the
        // `--tests` filters (it does not accept the `--tests` option).
        const coverage: CoverageDescriptor | undefined = isCoverageRun(context)
            ? createCoverageDescriptor()
            : undefined;
        if (coverage) {
            const gradleVersion = await getWrapperGradleVersion(context);
            const compatibilityError = getCoverageCompatibilityError(gradleVersion);
            if (compatibilityError) {
                this.finishTestRun(2, compatibilityError);
                return;
            }
            gradleArgs.push(JACOCO_REPORT_TASK);
        }

        const needsInitScript = isDebug || vmArgs.length > 0 || Object.keys(envVars).length > 0 || !!coverage;
        let initScriptWritten = false;
        // Unique per launch so overlapping run/debug sessions never share the
        // same init script contents or cleanup target.
        const testInitScriptPath = createInitScriptPath();
        if (needsInitScript) {
            const initScriptContent = this.getInitScriptContent(debugPort, vmArgs, envVars, coverage);
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
                await this.collectCoverageIfNeeded(context, coverage);
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
                // Coverage may still have been produced for the tests that did
                // run before the build failed, so surface whatever exists.
                await this.collectCoverageIfNeeded(context, coverage);
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
            if (coverage) {
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.file(coverage.rootDir), {
                        recursive: true,
                        useTrash: false,
                    });
                } catch {
                    /* best-effort */
                }
            }
        }
    }

    /**
     * Translate the JaCoCo XML report produced by a coverage run into VS Code
     * coverage attached to the current test run. No-op for non-coverage runs.
     */
    private async collectCoverageIfNeeded(
        context: IRunTestContext,
        coverage: CoverageDescriptor | undefined,
        sourceRoots: CoverageSourceRoot[] = []
    ): Promise<void> {
        if (!coverage || !context.testRun) {
            return;
        }
        try {
            await collectCoverage(
                coverage.reportDir,
                context.workspaceFolder,
                context.testRun,
                context.profile,
                sourceRoots
            );
        } catch (error) {
            console.error("[gradle-test] Failed to collect coverage:", error);
        }
    }

    private async getBuildTargetInfo(projectName: string): Promise<BuildTargetInfo> {
        try {
            const info = await withTimeout(
                vscode.commands.executeCommand<SerializedBuildTargetInfo>(
                    "java.execute.workspaceCommand",
                    "java.gradle.getBuildTargetInfo",
                    projectName
                ),
                BUILD_TARGET_INFO_TIMEOUT_MS
            );
            return {
                gradleVersion: info?.gradleVersion,
                sourceRoots: (info?.sourceRoots ?? []).map((root) => ({
                    uri: vscode.Uri.parse(root.uri),
                    isTest: root.isTest,
                    generated: root.generated,
                })),
            };
        } catch {
            return { sourceRoots: [] };
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

    public finishTestRun(statusCode: number, message?: string): void {
        // A BSP-delegated coverage run defers its "finished" signal until the
        // JaCoCo report (produced during the test phase) is parsed and coverage
        // is attached (see finalizePendingCoverageRun). Others finish immediately.
        const pending = this.pendingCoverageRun;
        if (pending) {
            this.pendingCoverageRun = undefined;
            void this.finalizePendingCoverageRun(pending, statusCode, message);
            return;
        }
        this.emitFinish(statusCode, message);
    }

    private emitFinish(statusCode: number, message?: string): void {
        this._onDidFinishTestRun.fire({
            statusCode,
            message,
        });
        const release = this.releaseGate;
        this.releaseGate = undefined;
        release?.();
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
    private getInitScriptContent(
        debugPort: number,
        vmArgs: string[],
        envVars: Record<string, string>,
        coverage?: CoverageDescriptor
    ): string {
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
        if (coverage) {
            lines.push(...getCoverageInitScriptLines(coverage));
        }
        return lines.join("\n");
    }
}

/**
 * Bookkeeping for a BSP-delegated coverage run whose coverage collection is
 * deferred until the streamed test run finishes.
 */
interface PendingCoverageRun {
    descriptor: CoverageDescriptor;
    initScriptPath: string;
    context: IRunTestContext;
    sourceRoots: CoverageSourceRoot[];
}

const BUILD_TARGET_INFO_TIMEOUT_MS = 5000;
const MINIMUM_COVERAGE_GRADLE_VERSION = "6.1";

interface SerializedBuildTargetInfo {
    gradleVersion?: string;
    sourceRoots?: {
        uri: string;
        isTest: boolean;
        generated: boolean;
    }[];
}

interface BuildTargetInfo {
    gradleVersion?: string;
    sourceRoots: CoverageSourceRoot[];
}

/**
 * Reject with an Error if `promise` does not settle within `timeoutMs`.
 * `vscode.commands.executeCommand` returns a Thenable, which this accepts.
 */
function withTimeout<T>(promise: Thenable<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out")), timeoutMs);
        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

function getCoverageCompatibilityError(gradleVersion: string | undefined): string | undefined {
    if (gradleVersion && compareVersions(gradleVersion, MINIMUM_COVERAGE_GRADLE_VERSION) < 0) {
        return `Gradle coverage requires Gradle ${MINIMUM_COVERAGE_GRADLE_VERSION} or newer (project uses ${gradleVersion}).`;
    }
    return undefined;
}

function compareVersions(left: string, right: string): number {
    const leftParts = left.split(/[.-]/).map((part) => parseInt(part, 10) || 0);
    const rightParts = right.split(/[.-]/).map((part) => parseInt(part, 10) || 0);
    const length = Math.max(leftParts.length, rightParts.length);
    for (let i = 0; i < length; i++) {
        const difference = (leftParts[i] ?? 0) - (rightParts[i] ?? 0);
        if (difference !== 0) {
            return difference;
        }
    }
    return 0;
}

async function getWrapperGradleVersion(context: IRunTestContext): Promise<string | undefined> {
    try {
        const wrappers = await vscode.workspace.findFiles(
            new vscode.RelativePattern(context.workspaceFolder, "**/gradle/wrapper/gradle-wrapper.properties"),
            null,
            20
        );
        if (wrappers.length === 0) {
            return undefined;
        }
        const testPath = context.testItems.find((item) => item.uri)?.uri?.fsPath ?? context.workspaceFolder.uri.fsPath;
        const wrapper =
            [...wrappers]
                .filter((uri) => isPathWithin(testPath, path.resolve(uri.fsPath, "..", "..", "..")))
                .sort((a, b) => b.fsPath.length - a.fsPath.length)[0] ?? wrappers[0];
        const content = Buffer.from(await vscode.workspace.fs.readFile(wrapper)).toString("utf-8");
        return /gradle-([0-9][0-9A-Za-z.-]*)-(?:bin|all)\.zip/.exec(content)?.[1];
    } catch {
        return undefined;
    }
}

function isPathWithin(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * A coverage run is one whose profile was registered with the Coverage kind.
 */
function isCoverageRun(context: IRunTestContext): boolean {
    return context.profile?.kind === vscode.TestRunProfileKind.Coverage;
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
