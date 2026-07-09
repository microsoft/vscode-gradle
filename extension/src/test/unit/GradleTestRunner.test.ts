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
        assert.strictEqual(finishStatus, -1);
    });

    it("runs coverage through BSP with the report as a test finalizer", async () => {
        const executeCommand = sinon.stub(vscode.commands, "executeCommand").resolves();
        const client = buildClient();
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, client);

        const finishEvents: number[] = [];
        runner.onDidFinishTestRun((event) => finishEvents.push(event.statusCode));

        const context = buildRunContext(
            testRunnerApi,
            [
                {
                    id: "class",
                    parts: { project: "demo", class: "com.example.AppTest" },
                },
            ],
            {},
            { kind: vscode.TestRunProfileKind.Coverage } as vscode.TestRunProfile
        );

        await runner.launch(context);

        // Tests are delegated through BSP (not the task server), and the BSP
        // test args carry the JaCoCo init script (which wires the report as a
        // `test` finalizer, so no separate report build is needed).
        assert.strictEqual(executeCommand.firstCall.args[1], "java.gradle.delegateTest");
        const bspArgs = executeCommand.firstCall.args[4] as string[];
        assert.strictEqual(bspArgs[0], "--init-script");
        assert.strictEqual(client.runBuild.called, false);
        // The run must NOT be finished until the server signals the streamed
        // test run is done.
        assert.strictEqual(finishEvents.length, 0);

        // Simulate the server's onDidFinishTestRun notification.
        runner.finishTestRun(0);
        await waitUntil(() => finishEvents.length > 0);

        // No separate task-server build runs for coverage; the report came from
        // the BSP phase. The run is finished only after coverage is collected.
        assert.strictEqual(client.runBuild.called, false);
        assert.deepStrictEqual(finishEvents, [0]);
        // Coverage collection resolves source files against the project's BSP
        // source roots (queried via the delegate command).
        assert.ok(
            executeCommand.getCalls().some((call) => call.args[1] === "java.gradle.getBuildTargetSources"),
            "expected java.gradle.getBuildTargetSources to be queried for coverage source resolution"
        );
    });

    it("serializes overlapping delegated runs (second waits for the first to finish)", async () => {
        // Run A's delegate command hangs until we resolve it, keeping A active.
        let resolveFirstCommand!: () => void;
        const firstCommand = new Promise<void>((resolve) => (resolveFirstCommand = resolve));
        const executeCommand = sinon.stub(vscode.commands, "executeCommand");
        executeCommand.onFirstCall().returns(firstCommand as unknown as Thenable<unknown>);
        executeCommand.returns(Promise.resolve(undefined) as unknown as Thenable<unknown>);

        const client = buildClient();
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, client);

        const ctxA = buildRunContext(testRunnerApi, [
            { id: "a", parts: { project: "demo", class: "com.example.ATest" } },
        ]);
        const ctxB = buildRunContext(testRunnerApi, [
            { id: "b", parts: { project: "demo", class: "com.example.BTest" } },
        ]);

        const launchA = runner.launch(ctxA);
        const launchB = runner.launch(ctxB);

        // A hangs on its command; B is gated behind A and must not start.
        await delay(20);
        assert.strictEqual(executeCommand.callCount, 1, "B must not start while A's run is active");

        // A's command completes, but A's run isn't "finished" until the server
        // signals it — B must keep waiting.
        resolveFirstCommand();
        await launchA;
        await delay(10);
        assert.strictEqual(executeCommand.callCount, 1, "B still waits until A's run finishes");

        // Finish A → releases the gate → B proceeds.
        runner.finishTestRun(0);
        await launchB;
        await delay(10);
        assert.strictEqual(executeCommand.callCount, 2, "B runs its delegate command only after A finishes");
    });
});

async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(condition: () => boolean, timeoutMs: number = 2000): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error("Timed out waiting for condition");
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
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
    testConfig: IRunTestContext["testConfig"] = {},
    profile?: vscode.TestRunProfile
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
        profile,
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
