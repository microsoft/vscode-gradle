import * as vscode from "vscode";
import {
    TestRunner,
    TestItemStatusChangeEvent,
    TestFinishEvent,
    IRunTestContext,
    TestIdParts,
} from "../java-test-runner.api";
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

    constructor(testRunnerApi: any) {
        this.testRunnerApi = testRunnerApi;
        this.testInitScriptPath = path.join(os.tmpdir(), "testInitScript.gradle");
    }

    public async launch(context: IRunTestContext): Promise<void> {
        this.context = context;
        const tests: Map<string, string[]> = new Map();
        context.testItems.forEach((testItem) => {
            const id = testItem.id;
            const parts: TestIdParts = this.testRunnerApi.parsePartsFromTestId(id);
            if (!parts.class) {
                return;
            }
            const testMethods = tests.get(parts.class) || [];
            if (parts.invocations?.length) {
                let methodId = parts.invocations[0];
                if (methodId.includes("(")) {
                    methodId = methodId.slice(0, methodId.indexOf("(")); // gradle test task doesn't support method with parameters
                }
                testMethods.push(methodId);
            }
            tests.set(parts.class, testMethods);
        });

        const agrs = context.testConfig?.args ?? [];
        const vmArgs = context.testConfig?.vmArgs;
        const isDebug = context.isDebug && !!vscode.extensions.getExtension("vscjava.vscode-java-debug");
        let debugPort = -1;
        if (isDebug) {
            debugPort = await getPort();
            // See: https://docs.gradle.org/current/javadoc/org/gradle/tooling/TestLauncher.html#debugTestsOn(int)
            // since the gradle tooling api does not support debug tests in server=y mode, so we use the init script
            // as a workaround
            const initScriptContent = `allprojects {
    afterEvaluate {
        tasks.withType(Test) {
            debugOptions {
                enabled = true
                host = 'localhost'
                port = ${debugPort}
                server = true
                suspend = true
            }
        }
    }
}`;
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(this.testInitScriptPath),
                Buffer.from(initScriptContent)
            );
            agrs.unshift("--init-script", this.testInitScriptPath);
        }
        const env = context.testConfig?.env;
        try {
            await vscode.commands.executeCommand(
                "java.execute.workspaceCommand",
                "java.gradle.delegateTest",
                context.projectName,
                JSON.stringify([...tests]),
                agrs,
                vmArgs,
                env
            );
            if (isDebug) {
                this.startJavaDebug(debugPort);
            }
        } catch (error) {
            this.finishTestRun(-1, error.message);
        }
    }

    public updateTestItem(
        testParts: string[],
        state: number,
        displayName?: string,
        message?: string,
        duration?: number
    ): void {
        if (message) {
            message = this.filterStackTrace(message);
        }
        const testId = this.testRunnerApi.parseTestIdFromParts({
            project: this.context.projectName,
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
}
