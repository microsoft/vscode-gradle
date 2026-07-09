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
    // Set while a BSP-delegated coverage run is in flight. The BSP path finishes
    // asynchronously via the server's onDidFinishTestRun notification, so this
    // lets finishTestRun() attach coverage before the run is actually ended.
    private pendingCoverageRun: PendingCoverageRun | undefined;
    // Delegated runs share this singleton's state (bspContext,
    // pendingCoverageRun) and receive results via global callbacks that carry no
    // run id, so overlapping runs would route one run's results/coverage into
    // another. Until per-run routing exists (needs an originId threaded through
    // the server + jdtls), we serialize: `runChain` tails the latest run and a
    // new launch awaits it; `releaseGate` releases the tail when the active run
    // truly finishes (its onDidFinishTestRun is emitted). `rearmGateBackstop`
    // resets an idle watchdog on every per-test update so a long-but-active run
    // doesn't trip the safety release.
    private runChain: Promise<void> = Promise.resolve();
    private releaseGate: (() => void) | undefined;
    private rearmGateBackstop: (() => void) | undefined;

    public onDidChangeTestItemStatus: vscode.Event<TestItemStatusChangeEvent> = this._onDidChangeTestItemStatus.event;
    public onDidFinishTestRun: vscode.Event<TestFinishEvent> = this._onDidFinishTestRun.event;

    constructor(testRunnerApi: any, private readonly client: TaskServerClient) {
        this.testRunnerApi = testRunnerApi;
    }

    public async launch(context: IRunTestContext): Promise<void> {
        // Serialize delegated runs (see runChain/releaseGate fields): a new run
        // waits for the previous one to fully finish so their shared state and
        // global result callbacks don't cross. This run holds the gate until it
        // finishes (emitFinish) — which for BSP is a later server notification —
        // so the next run can't start and clobber this run's state.
        const previous = this.runChain;
        let resolveChain!: () => void;
        this.runChain = new Promise<void>((resolve) => (resolveChain = resolve));
        try {
            await previous;
        } catch {
            // A failed prior run must not block this one.
        }
        let released = false;
        let backstopTimer: NodeJS.Timeout | undefined;
        const release = () => {
            if (released) {
                return;
            }
            released = true;
            if (backstopTimer) {
                clearTimeout(backstopTimer);
            }
            // Clear the shared gate/watchdog if they still point at this run, so
            // a late, stray notification can't release a later run's gate.
            if (this.releaseGate === release) {
                this.releaseGate = undefined;
            }
            if (this.rearmGateBackstop === armBackstop) {
                this.rearmGateBackstop = undefined;
            }
            resolveChain();
        };
        const armBackstop = () => {
            if (released) {
                return;
            }
            if (backstopTimer) {
                clearTimeout(backstopTimer);
            }
            backstopTimer = setTimeout(release, RUN_FINISH_IDLE_TIMEOUT_MS);
            backstopTimer.unref?.();
        };
        this.releaseGate = release;
        this.rearmGateBackstop = armBackstop;
        try {
            await this.doLaunch(context);
        } catch (error) {
            release();
            throw error;
        }
        if (!released) {
            // The delegate command only *dispatches* the BSP test run (it is not
            // awaited server-side), so doLaunch returns while tests are still
            // running; the run finishes later via an onDidFinishTestRun
            // notification (-> emitFinish -> release). Arm an idle watchdog:
            // every per-test status update resets it (see updateTestItem), so a
            // long-but-active run never trips it, while a dead connection (no
            // events, no finish) eventually releases the gate for future runs.
            armBackstop();
        }
    }

    private async doLaunch(context: IRunTestContext): Promise<void> {
        if (isCoverageRun(context)) {
            // Coverage runs the tests through the BSP delegate (faithful
            // execution + streamed per-test results) with a JaCoCo init script
            // that instruments the test JVM and wires
            // `test.finalizedBy(jacocoTestReport)`, so the report is produced in
            // the same BSP invocation (TestLauncher cannot run tasks directly).
            // When BSP is unavailable we fall back to the all-in-one
            // task-server path.
            try {
                await this.launchCoverageWithBsp(context);
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
        // Activity from the in-flight BSP run: reset the serialization watchdog
        // so a long-but-active run keeps holding the gate.
        this.rearmGateBackstop?.();
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

    /**
     * Coverage on the BSP path: run the tests through the BSP delegate command
     * (Tooling API TestLauncher — faithful execution + streamed results) with a
     * JaCoCo init script. The init script both instruments the test JVM (so it
     * produces `.exec` data) and wires `test.finalizedBy(jacocoTestReport)`, so
     * the report is generated in the same invocation even though TestLauncher
     * cannot run tasks directly. Coverage is collected in
     * {@link finalizePendingCoverageRun} once the streamed run finishes
     * (signalled by the server's onDidFinishTestRun -> {@link finishTestRun}).
     */
    private async launchCoverageWithBsp(context: IRunTestContext): Promise<void> {
        this.bspContext = context;
        const tests = this.buildTestsMap(context);

        const coverage = createCoverageDescriptor();
        const initScriptPath = createInitScriptPath();
        // vmArgs/env are forwarded through the delegate command params (the
        // server applies them to the forked test JVM), so the init script only
        // needs the JaCoCo wiring here.
        const initScriptContent = this.getInitScriptContent(-1, [], {}, coverage);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(initScriptPath), Buffer.from(initScriptContent));

        const args = [...(context.testConfig?.args ?? [])];
        args.unshift("--init-script", initScriptPath);
        const vmArgs = context.testConfig?.vmArgs;
        const env = context.testConfig?.env;

        // The BSP run ends via the server's onDidFinishTestRun notification,
        // which lands in finishTestRun(). Record this run so that callback can
        // attach coverage BEFORE ending the run.
        this.pendingCoverageRun = {
            descriptor: coverage,
            initScriptPath,
            context,
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
            // The test phase never produced results (e.g. BSP unavailable); drop
            // the pending bookkeeping so the caller's fallback / error finish is
            // clean and doesn't leave a stray coverage-collection deferral.
            await this.discardPendingCoverageRun();
            throw error;
        }
    }

    /**
     * Coverage on the BSP path (finalization): the JaCoCo report was already
     * produced during the BSP test phase — the init script wires
     * `test.finalizedBy(jacocoTestReport)`, so the TestLauncher run emits the
     * report as a finalizer once the tests finish. Here we only parse it into
     * VS Code coverage and then end the run. Deferring the finish until after
     * coverage is attached guarantees it lands before the run is closed.
     */
    private async finalizePendingCoverageRun(
        pending: PendingCoverageRun,
        statusCode: number,
        message?: string
    ): Promise<void> {
        try {
            await this.collectCoverageIfNeeded(pending.context, pending.descriptor);
        } finally {
            await this.cleanupCoverageArtifacts(pending);
            this.emitFinish(statusCode, message);
        }
    }

    /** Best-effort removal of a coverage run's per-run temp init script and report dir. */
    private async cleanupCoverageArtifacts(pending: PendingCoverageRun): Promise<void> {
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(pending.initScriptPath));
        } catch {
            /* best-effort */
        }
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(pending.descriptor.reportDir), {
                recursive: true,
                useTrash: false,
            });
        } catch {
            /* best-effort */
        }
    }

    /** Clear pending coverage bookkeeping and clean up its artifacts (used when the BSP phase aborts). */
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
                    await vscode.workspace.fs.delete(vscode.Uri.file(coverage.reportDir), {
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
        coverage: CoverageDescriptor | undefined
    ): Promise<void> {
        if (!coverage || !context.testRun) {
            return;
        }
        try {
            const sourceRoots = await this.getBuildTargetSourceRoots(context.projectName);
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

    /**
     * Query the BSP `buildTarget/sources` roots for a project (via the jdtls
     * delegate command) so coverage can resolve source files against the
     * authoritative, project-scoped source directories. Best-effort: returns an
     * empty list when the project isn't a build-server project or the command is
     * unavailable, in which case coverage falls back to a workspace-wide glob.
     */
    private async getBuildTargetSourceRoots(projectName: string): Promise<vscode.Uri[]> {
        try {
            // This query sits on the critical path to finishing a coverage run
            // (coverage is collected before the run is ended), so bound it: a
            // slow/hung jdtls round-trip must not block run completion. On
            // timeout we fall back to a workspace-wide glob.
            const uris = await withTimeout(
                vscode.commands.executeCommand<string[]>(
                    "java.execute.workspaceCommand",
                    "java.gradle.getBuildTargetSources",
                    projectName
                ),
                BUILD_TARGET_SOURCES_TIMEOUT_MS
            );
            return (uris ?? []).map((uri) => vscode.Uri.parse(uri));
        } catch {
            return [];
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

    /**
     * Fire the run-finished event and release the serialization gate so the next
     * queued run can start. This is the single point where a run is considered
     * fully done.
     */
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
}

/**
 * Upper bound for the `buildTarget/sources` query used to resolve coverage
 * source files. Kept small because it runs on the critical path to finishing a
 * coverage run; on timeout we fall back to a workspace-wide glob.
 */
const BUILD_TARGET_SOURCES_TIMEOUT_MS = 5000;

/**
 * Idle timeout for the serialization watchdog: how long the runner waits with no
 * per-test activity and no onDidFinishTestRun before releasing the gate for the
 * next queued run. Reset on every per-test update, so it only fires when a run's
 * result stream has gone silent (e.g. a dropped BSP connection), never during an
 * actively-reporting run — however long that run takes.
 */
const RUN_FINISH_IDLE_TIMEOUT_MS = 300000;

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
