import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { GradleTestRunner } from "../../bs/GradleTestRunner";
import { IRunTestContext, TestIdParts, TestResultState } from "../../java-test-runner.api";
import { getSuiteName } from "../testUtil";

describe(getSuiteName("Gradle test runner XML fallback"), () => {
    afterEach(() => {
        sinon.restore();
    });

    it("maps parameterized XML result names back to the originally requested test id", async () => {
        stubBspUnavailable();
        const fileUri = vscode.Uri.file("C:\\workspace\\build\\test-results\\test\\TEST-com.example.AppTest.xml");
        stubTestResultFiles(
            fileUri,
            `<testsuite>
  <testcase name="shouldPass[1]" classname="com.example.AppTest" time="0.01"/>
</testsuite>`
        );

        const client = buildClient();
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, client);
        const events = captureStatusEvents(runner);

        await runner.launch(
            buildRunContext(testRunnerApi, [
                {
                    id: "method",
                    parts: {
                        project: "demo",
                        class: "com.example.AppTest",
                        invocations: ["shouldPass(String)"],
                    },
                },
            ])
        );

        assert.deepStrictEqual(client.runBuild.firstCall.args[2], [
            "cleanTest",
            "test",
            "--tests",
            "com.example.AppTest.shouldPass",
        ]);
        assert.ok(
            events.some(
                (e) => e.testId === "com.example.AppTest#shouldPass(String)" && e.state === TestResultState.Passed
            )
        );
        assert.ok(
            !events.some(
                (e) =>
                    e.testId === "com.example.AppTest#shouldPass(String)" &&
                    e.state === TestResultState.Errored &&
                    e.message?.includes("No test result was reported")
            )
        );
    });

    it("finalizes a requested class item from child XML results", async () => {
        stubBspUnavailable();
        const fileUri = vscode.Uri.file("C:\\workspace\\build\\test-results\\test\\TEST-com.example.AppTest.xml");
        stubTestResultFiles(
            fileUri,
            `<testsuite>
  <testcase name="passes" classname="com.example.AppTest" time="0.01"/>
  <testcase name="fails" classname="com.example.AppTest" time="0.02">
    <failure message="boom"/>
  </testcase>
</testsuite>`
        );

        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, buildClient());
        const events = captureStatusEvents(runner);

        await runner.launch(
            buildRunContext(testRunnerApi, [
                {
                    id: "class",
                    parts: {
                        project: "demo",
                        class: "com.example.AppTest",
                    },
                },
            ])
        );

        const classTerminalEvents = events.filter(
            (e) => e.testId === "com.example.AppTest" && e.state !== TestResultState.Running
        );
        assert.strictEqual(classTerminalEvents.length, 1);
        assert.strictEqual(classTerminalEvents[0].state, TestResultState.Failed);
    });

    it("uses a unique init script path for each launch", async () => {
        stubBspUnavailable();
        const fileUri = vscode.Uri.file("C:\\workspace\\build\\test-results\\test\\TEST-com.example.AppTest.xml");
        stubTestResultFiles(
            fileUri,
            `<testsuite>
  <testcase name="passes" classname="com.example.AppTest" time="0.01"/>
</testsuite>`
        );
        sinon.stub(vscode.workspace.fs, "writeFile").resolves();
        sinon.stub(vscode.workspace.fs, "delete").resolves();

        const client = buildClient();
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, client);
        const context = buildRunContext(
            testRunnerApi,
            [
                {
                    id: "class",
                    parts: {
                        project: "demo",
                        class: "com.example.AppTest",
                    },
                },
            ],
            {
                env: { FOO: "bar" },
            }
        );

        await runner.launch(context);
        await runner.launch(context);

        const firstArgs = client.runBuild.firstCall.args[2] as string[];
        const secondArgs = client.runBuild.secondCall.args[2] as string[];
        assert.strictEqual(firstArgs[0], "--init-script");
        assert.strictEqual(secondArgs[0], "--init-script");
        assert.notStrictEqual(firstArgs[1], secondArgs[1]);
    });

    it("uses BSP first when the BSP delegate command succeeds", async () => {
        const executeCommand = sinon.stub(vscode.commands, "executeCommand").resolves();
        const client = buildClient();
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, client);

        await runner.launch(
            buildRunContext(testRunnerApi, [
                {
                    id: "method",
                    parts: {
                        project: "demo",
                        class: "com.example.AppTest",
                        invocations: ["shouldPass(String)"],
                    },
                },
            ])
        );

        assert.strictEqual(client.runBuild.called, false);
        assert.strictEqual(executeCommand.firstCall.args[0], "java.execute.workspaceCommand");
        assert.strictEqual(executeCommand.firstCall.args[1], "java.gradle.delegateTest");
        assert.strictEqual(executeCommand.firstCall.args[2], "demo");
        assert.strictEqual(executeCommand.firstCall.args[3], JSON.stringify([["com.example.AppTest", ["shouldPass"]]]));
    });

    it("does not XML fallback for non-BSP delegate errors", async () => {
        sinon.stub(vscode.commands, "executeCommand").rejects(new Error("Gradle test execution failed"));
        const client = buildClient();
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, client);
        let finishStatus: number | undefined;
        runner.onDidFinishTestRun((event) => {
            finishStatus = event.statusCode;
        });

        await runner.launch(
            buildRunContext(testRunnerApi, [
                {
                    id: "method",
                    parts: {
                        project: "demo",
                        class: "com.example.AppTest",
                        invocations: ["shouldPass"],
                    },
                },
            ])
        );

        assert.strictEqual(client.runBuild.called, false);
        assert.strictEqual(finishStatus, -1);
    });
});

function stubBspUnavailable(): void {
    sinon
        .stub(vscode.commands, "executeCommand")
        .rejects(new Error("Project is not a Gradle build server project: demo"));
}

function stubTestResultFiles(fileUri: vscode.Uri, xml: string): void {
    sinon.stub(vscode.workspace, "findFiles").resolves([fileUri]);
    sinon.stub(vscode.workspace.fs, "stat").resolves({
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now() + 60_000,
        size: xml.length,
    });
    sinon.stub(vscode.workspace.fs, "readFile").resolves(Buffer.from(xml));
}

function buildClient(): any {
    return {
        runBuild: sinon.stub().resolves(),
        cancelBuild: sinon.stub().resolves(),
    };
}

function buildTestRunnerApi(): any {
    const partsById = new Map<string, TestIdParts>();
    return {
        parsePartsFromTestId: (id: string): TestIdParts => partsById.get(id)!,
        parseTestIdFromParts: (parts: TestIdParts): string => {
            if (parts.invocations?.length) {
                return `${parts.class}#${parts.invocations.join("#")}`;
            }
            return parts.class ?? parts.project;
        },
        setParts(id: string, parts: TestIdParts): void {
            partsById.set(id, parts);
        },
    };
}

function buildRunContext(
    testRunnerApi: ReturnType<typeof buildTestRunnerApi>,
    items: Array<{ id: string; parts: TestIdParts }>,
    testConfig: IRunTestContext["testConfig"] = {}
): IRunTestContext {
    for (const item of items) {
        testRunnerApi.setParts(item.id, item.parts);
    }
    return {
        isDebug: false,
        kind: 0,
        projectName: "demo",
        testItems: items.map((item) => ({ id: item.id } as vscode.TestItem)),
        testRun: {} as vscode.TestRun,
        workspaceFolder: {
            index: 0,
            name: "workspace",
            uri: vscode.Uri.file("C:\\workspace"),
        },
        testConfig,
    };
}

function captureStatusEvents(
    runner: GradleTestRunner
): Array<{ testId: string; state: TestResultState; message?: string }> {
    const events: Array<{ testId: string; state: TestResultState; message?: string }> = [];
    runner.onDidChangeTestItemStatus((event) => {
        events.push({
            testId: event.testId,
            state: event.state,
            message: event.message,
        });
    });
    return events;
}
