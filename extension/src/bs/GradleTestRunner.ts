import * as vscode from "vscode";
import { TestRunner, TestItemStatusChangeEvent, TestFinishEvent, IRunTestContext } from "../java-test-runner.api";

export class GradleTestRunner implements TestRunner {
    private readonly _onDidChangeTestItemStatus = new vscode.EventEmitter<TestItemStatusChangeEvent>();
    private readonly _onDidFinishTestRun = new vscode.EventEmitter<TestFinishEvent>();

    public onDidChangeTestItemStatus: vscode.Event<TestItemStatusChangeEvent> = this._onDidChangeTestItemStatus.event;
    public onDidFinishTestRun: vscode.Event<TestFinishEvent> = this._onDidFinishTestRun.event;

    public launch(context: IRunTestContext): void {
        const tests: string[] = context.testItems.map((testItem) => {
            const id = testItem.id;
            if (id.includes("@")) {
                return id.slice(id.indexOf("@") + 1);
            }
            return id;
        });

        const agrs = context.testConfig?.args;
        const vmArgs = context.testConfig?.vmArgs;
        const env = context.testConfig?.env;
        vscode.commands.executeCommand(
            "java.execute.workspaceCommand",
            "java.gradle.delegateTest",
            context.projectName,
            tests,
            agrs,
            vmArgs,
            env
        );
    }

    public updateTestItem(
        test: string,
        state: number,
        displayName?: string,
        message?: string,
        duration?: number
    ): void {
        if (message) {
            message = this.filterStackTrace(message);
        }
        this._onDidChangeTestItemStatus.fire({
            test,
            state,
            displayName,
            message,
            duration,
        });
    }

    public finishTestRun(status: number, message?: string): void {
        this._onDidFinishTestRun.fire({
            status,
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
}
