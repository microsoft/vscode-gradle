import * as assert from "assert";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { GradleTestRunner } from "../../bs/GradleTestRunner";
import { IRunTestContext, TestIdParts, TestResultState } from "../../java-test-runner.api";
import { getSuiteName } from "../testUtil";

describe(getSuiteName("Gradle test runner XML fallback"), () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        sinon.restore();
        for (const dir of tempDirs.splice(0)) {
            fs.removeSync(dir);
        }
    });

    it("maps parameterized XML result names back to the originally requested test id", async () => {
        stubBspUnavailable();
        stubTestResultFiles(
            tempDirs,
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
        stubTestResultFiles(
            tempDirs,
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
        stubTestResultFiles(
            tempDirs,
            `<testsuite>
  <testcase name="passes" classname="com.example.AppTest" time="0.01"/>
</testsuite>`
        );

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
        assert.strictEqual(finishStatus, 2);
    });
});

describe(getSuiteName("Gradle test runner run lifecycle"), () => {
    afterEach(() => {
        sinon.restore();
    });

    it("finishes the run when the build server never reports a result", async () => {
        // A Gradle version the build server cannot drive, a dropped connection or a
        // target with nothing to run all end the request without any test report.
        sinon.stub(vscode.commands, "executeCommand").resolves(2);
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, buildClient());
        const finishes = captureFinishEvents(runner);

        await runner.launch(buildRunContext(testRunnerApi, [singleTestItem()]));

        assert.deepStrictEqual(finishes, [{ statusCode: 2, message: undefined }]);
    });

    it("prefers the build server's own report over the end of the request", async () => {
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, buildClient());
        const finishes = captureFinishEvents(runner);
        sinon.stub(vscode.commands, "executeCommand").callsFake(async (...args: any[]) => {
            runner.finishTestRun(2, "3 tests failed", args[7]);
            return 1;
        });

        await runner.launch(buildRunContext(testRunnerApi, [singleTestItem()]));

        assert.deepStrictEqual(finishes, [{ statusCode: 2, message: "3 tests failed" }]);
    });

    it("ignores a report belonging to a run that already ended", async () => {
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, buildClient());
        sinon.stub(vscode.commands, "executeCommand").resolves(1);
        await runner.launch(buildRunContext(testRunnerApi, [singleTestItem()]));

        const finishes = captureFinishEvents(runner);
        let staleReportDelivered = false;
        sinon.restore();
        sinon.stub(vscode.commands, "executeCommand").callsFake(async () => {
            // The previous run's report, arriving while its successor is in flight.
            runner.finishTestRun(2, "stale", "vscode-gradle-test-stale");
            staleReportDelivered = true;
            return 1;
        });

        await runner.launch(buildRunContext(testRunnerApi, [singleTestItem()]));

        assert.strictEqual(staleReportDelivered, true);
        assert.deepStrictEqual(finishes, [{ statusCode: 1, message: undefined }]);
    });

    it("runs one test run at a time", async () => {
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, buildClient());
        let inFlight = 0;
        let overlapped = false;
        sinon.stub(vscode.commands, "executeCommand").callsFake(async () => {
            overlapped = overlapped || ++inFlight > 1;
            await new Promise((resolve) => setTimeout(resolve, 10));
            inFlight--;
            return 1;
        });

        await Promise.all([
            runner.launch(buildRunContext(testRunnerApi, [singleTestItem()])),
            runner.launch(buildRunContext(testRunnerApi, [singleTestItem()])),
        ]);

        assert.strictEqual(overlapped, false);
    });

    it("does not launch a run that was cancelled while queued", async () => {
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, buildClient());
        const executeCommand = sinon.stub(vscode.commands, "executeCommand").resolves(1);
        const context = buildRunContext(testRunnerApi, [singleTestItem()]);
        context.cancellationToken = { isCancellationRequested: true } as vscode.CancellationToken;
        const finishes = captureFinishEvents(runner);

        await runner.launch(context);

        assert.strictEqual(executeCommand.called, false);
        // The run still has to be reported, otherwise the queue never advances.
        assert.deepStrictEqual(finishes, [{ statusCode: 3, message: undefined }]);
    });

    it("keeps the queue moving after a run fails", async () => {
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, buildClient());
        const executeCommand = sinon.stub(vscode.commands, "executeCommand");
        executeCommand.onFirstCall().rejects(new Error("Gradle test execution failed"));
        executeCommand.onSecondCall().resolves(1);
        const finishes = captureFinishEvents(runner);

        await runner.launch(buildRunContext(testRunnerApi, [singleTestItem()]));
        await runner.launch(buildRunContext(testRunnerApi, [singleTestItem()]));

        assert.strictEqual(finishes.length, 2);
        assert.strictEqual(finishes[0].statusCode, 2);
        assert.strictEqual(finishes[1].statusCode, 1);
    });
});

function singleTestItem(): { id: string; parts: TestIdParts } {
    return {
        id: "method",
        parts: {
            project: "demo",
            class: "com.example.AppTest",
            invocations: ["shouldPass"],
        },
    };
}

function captureFinishEvents(runner: GradleTestRunner): Array<{ statusCode: number; message?: string }> {
    const finishes: Array<{ statusCode: number; message?: string }> = [];
    runner.onDidFinishTestRun((event) => {
        finishes.push({ statusCode: event.statusCode, message: event.message });
    });
    return finishes;
}

function stubBspUnavailable(): void {
    sinon
        .stub(vscode.commands, "executeCommand")
        .rejects(new Error("Project is not a Gradle build server project: demo"));
}

function stubTestResultFiles(tempDirs: string[], xml: string): void {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gradle-runner-test-"));
    tempDirs.push(tempDir);
    const resultFile = path.join(tempDir, "build", "test-results", "test", "TEST-com.example.AppTest.xml");
    fs.ensureDirSync(path.dirname(resultFile));
    fs.writeFileSync(resultFile, xml);
    const fileUri = vscode.Uri.file(resultFile);
    sinon.stub(vscode.workspace, "findFiles").resolves([fileUri]);
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
