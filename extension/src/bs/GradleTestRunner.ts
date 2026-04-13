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
        this.testInitScriptPath = path.join(os.tmpdir(), "testInitScript.gradle");
    }

    public async launch(context: IRunTestContext): Promise<void> {
        this.context = context;

        // Build --tests filter arguments from test items
        const testFilters: string[] = [];
        context.testItems.forEach((testItem) => {
            const id = testItem.id;
            const parts: TestIdParts = this.testRunnerApi.parsePartsFromTestId(id);
            if (!parts.class) {
                return;
            }
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

        // Build gradle args: test --tests "filter1" --tests "filter2" ...
        const gradleArgs: string[] = ["test"];
        for (const filter of testFilters) {
            gradleArgs.push("--tests", filter);
        }

        const userArgs = context.testConfig?.args ?? [];
        gradleArgs.push(...userArgs);

        const vmArgs = context.testConfig?.vmArgs;
        if (vmArgs?.length) {
            for (const vmArg of vmArgs) {
                gradleArgs.push(`-Dorg.gradle.jvmargs=${vmArg}`);
            }
        }

        const isDebug = context.isDebug && !!vscode.extensions.getExtension("vscjava.vscode-java-debug");
        let debugPort = -1;
        if (isDebug) {
            debugPort = await getPort();
            const initScriptContent = this.getInitScriptContent(debugPort);
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(this.testInitScriptPath),
                Buffer.from(initScriptContent)
            );
            gradleArgs.unshift("--init-script", this.testInitScriptPath);
        }

        const projectFolder = context.workspaceFolder.uri.fsPath;

        // Mark all test items as running
        context.testItems.forEach((testItem) => {
            const id = testItem.id;
            const parts: TestIdParts = this.testRunnerApi.parsePartsFromTestId(id);
            if (parts.class) {
                const testId = this.testRunnerApi.parseTestIdFromParts({
                    project: context.projectName,
                    class: parts.class,
                    invocations: parts.invocations,
                });
                this._onDidChangeTestItemStatus.fire({
                    testId,
                    state: TestResultState.Running,
                });
            }
        });

        // Start debug attachment concurrently — the init script sets suspend=y,
        // so the test JVM blocks until the debugger connects. We must start
        // waiting for the debug port BEFORE runBuild, otherwise it's a deadlock.
        if (isDebug) {
            this.startJavaDebug(debugPort);
        }

        try {
            await this.client.runBuild(
                projectFolder,
                `gradleTestRun-${Date.now()}`,
                gradleArgs,
                "",
                isDebug ? debugPort : 0
            );

            // Parse JUnit XML results and emit status events
            const results = await parseTestResults(context.workspaceFolder.uri);
            this.emitTestResults(results);
            this.finishTestRun(0);
        } catch (error) {
            // Gradle exits with non-zero when tests fail — still parse results
            try {
                const results = await parseTestResults(context.workspaceFolder.uri);
                if (results.length > 0) {
                    this.emitTestResults(results);
                    this.finishTestRun(0);
                } else {
                    this.finishTestRun(1, error.message || "Gradle test execution failed");
                }
            } catch {
                this.finishTestRun(1, error.message || "Gradle test execution failed");
            }
        }
    }

    private emitTestResults(results: TestCaseResult[]): void {
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
            this._onDidChangeTestItemStatus.fire({
                testId,
                state: result.state,
                displayName: result.displayName,
                message,
                duration: result.duration,
            });
        }
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
     * See: https://docs.gradle.org/current/javadoc/org/gradle/tooling/TestLauncher.html#debugTestsOn(int)
     * since the gradle tooling api does not support debug tests in server=y mode, so we use the init script
     * as a workaround.
     *
     * We directly set the jvmArgs here because the debugOptions in the init script does not work for Gradle > 8.4.
     *
     * Note that this approach may have problem that multiple test tasks are executed in one build invocation.
     * In that case, there's a race between tasks that first uses the specified debug port. To resolve this issue,
     * we may consider checking the project root path in the init script as well.
     */
    private getInitScriptContent(debugPort: number): string {
        return `allprojects {
    tasks.withType(Test) {
        jvmArgs '-agentlib:jdwp=transport=dt_socket,server=y,address=${debugPort},suspend=y'
    }
}`;
    }
}
