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

    public updateTestItem(event: TestItemStatusChangeEvent): void {
        this._onDidChangeTestItemStatus.fire(event);
    }

    public finishTestRun(event: TestFinishEvent): void {
        this._onDidFinishTestRun.fire(event);
    }
}
