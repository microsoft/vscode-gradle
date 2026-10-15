import * as assert from "assert";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { GradleTestRunner } from "../../bs/GradleTestRunner";
import { IRunTestContext, TestIdParts, TestResultState } from "../../java-test-runner.api";
import { getSuiteName } from "../testUtil";
import * as util from "../../util";
import { logger } from "../../logger";

describe(getSuiteName("Gradle test runner XML fallback"), () => {
    const tempDirs: string[] = [];
    const initScripts: string[] = [];

    afterEach(() => {
        sinon.restore();
        for (const dir of tempDirs.splice(0)) {
            fs.removeSync(dir);
        }
        for (const script of initScripts.splice(0)) {
            fs.removeSync(script);
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
        assert.ok(!fs.existsSync(firstArgs[1]));
        assert.ok(!fs.existsSync(secondArgs[1]));
    });

    it("keeps the BSP debug init script after submission and test reports until the request completes", async () => {
        const executeCommand = sinon.stub(vscode.commands, "executeCommand").resolves();
        const startDebugging = stubJavaDebug();
        const testRunnerApi = buildTestRunnerApi();
        const client = buildClient();
        const runner = new GradleTestRunner(testRunnerApi, client);

        await runner.launch(buildDebugContext(testRunnerApi));

        const scriptPath: string = executeCommand.firstCall.args[7];
        initScripts.push(scriptPath);
        assert.strictEqual(executeCommand.firstCall.args[4][1], scriptPath);
        assert.ok(fs.existsSync(scriptPath), "Submission must not release an unread init script");
        assert.ok(startDebugging.calledOnce, "Debug attachment must not wait for test completion");
        assert.ok(!client.runBuild.called, "BSP success must not rerun tests through XML fallback");
        runner.finishTestRun(0);
        assert.ok(fs.existsSync(scriptPath), "A test report is not the BSP request completion boundary");

        await runner.completeBspTestRequest(scriptPath);

        assert.ok(!fs.existsSync(scriptPath));
    });

    it("cleans only the completed BSP launch and ignores repeated or unowned completion notifications", async () => {
        const executeCommand = sinon.stub(vscode.commands, "executeCommand").resolves();
        stubJavaDebug();
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, buildClient());
        const context = buildDebugContext(testRunnerApi);

        await Promise.all([runner.launch(context), runner.launch(context)]);

        const firstPath: string = executeCommand.firstCall.args[7];
        const secondPath: string = executeCommand.secondCall.args[7];
        initScripts.push(firstPath, secondPath);
        assert.notStrictEqual(firstPath, secondPath);
        await runner.completeBspTestRequest(secondPath);
        assert.ok(fs.existsSync(firstPath));
        assert.ok(!fs.existsSync(secondPath));

        const unownedDir = fs.mkdtempSync(path.join(os.tmpdir(), "gradle-runner-unowned-"));
        tempDirs.push(unownedDir);
        const unownedPath = path.join(unownedDir, "unowned-init.gradle");
        fs.writeFileSync(unownedPath, "// user-owned init script");
        const logWarning = sinon.stub(logger, "warn");
        await runner.completeBspTestRequest(secondPath);
        await runner.completeBspTestRequest(unownedPath);
        assert.ok(fs.existsSync(unownedPath));
        assert.ok(!logWarning.called);
        await runner.completeBspTestRequest(firstPath);
        assert.ok(!fs.existsSync(firstPath));
    });

    it("handles BSP completion arriving before the submission command returns", async () => {
        const executeCommand = sinon.stub(vscode.commands, "executeCommand");
        stubJavaDebug();
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, buildClient());
        executeCommand.callsFake(async (...args: unknown[]) => {
            const scriptPath = args[7];
            assert.strictEqual(typeof scriptPath, "string");
            if (typeof scriptPath !== "string") {
                throw new Error("Missing init script completion key");
            }
            initScripts.push(scriptPath);
            assert.ok(fs.existsSync(scriptPath));
            await runner.completeBspTestRequest(scriptPath);
        });

        await runner.launch(buildDebugContext(testRunnerApi));

        assert.ok(!fs.existsSync(initScripts[0]));
    });

    it("retains the BSP script on an ambiguous command failure until confirmed completion", async () => {
        const executeCommand = sinon.stub(vscode.commands, "executeCommand").rejects(new Error("Connection lost"));
        stubJavaDebug();
        const testRunnerApi = buildTestRunnerApi();
        const client = buildClient();
        const runner = new GradleTestRunner(testRunnerApi, client);

        await runner.launch(buildDebugContext(testRunnerApi));

        const scriptPath: string = executeCommand.firstCall.args[7];
        initScripts.push(scriptPath);
        assert.ok(fs.existsSync(scriptPath));
        assert.ok(!client.runBuild.called);
        await runner.completeBspTestRequest(scriptPath);
        assert.ok(!fs.existsSync(scriptPath));
    });

    it("releases an unavailable BSP delegate's script before XML fallback", async () => {
        const executeCommand = stubBspUnavailable();
        stubJavaDebug();
        stubTestResultFiles(
            tempDirs,
            '<testsuite><testcase name="passes" classname="com.example.AppTest"/></testsuite>'
        );
        const testRunnerApi = buildTestRunnerApi();
        const client = buildClient();
        const runner = new GradleTestRunner(testRunnerApi, client);
        client.runBuild.callsFake(async () => {
            const bspPath: string = executeCommand.firstCall.args[7];
            initScripts.push(bspPath);
            assert.ok(!fs.existsSync(bspPath));
            const xmlPath: string = client.runBuild.firstCall.args[2][1];
            assert.ok(fs.existsSync(xmlPath));
        });

        await runner.launch(buildDebugContext(testRunnerApi));

        assert.ok(client.runBuild.calledOnce);
        assert.ok(!fs.existsSync(client.runBuild.firstCall.args[2][1]));
    });

    it("logs init script cleanup failures without rejecting request completion", async () => {
        const executeCommand = sinon.stub(vscode.commands, "executeCommand").resolves();
        stubJavaDebug();
        const testRunnerApi = buildTestRunnerApi();
        const runner = new GradleTestRunner(testRunnerApi, buildClient());
        await runner.launch(buildDebugContext(testRunnerApi));
        const scriptPath: string = executeCommand.firstCall.args[7];
        initScripts.push(scriptPath);
        fs.removeSync(scriptPath);
        const logWarning = sinon.stub(logger, "warn");

        await runner.completeBspTestRequest(scriptPath);

        assert.ok(logWarning.calledOnce);
        assert.strictEqual(logWarning.firstCall.args[0], "Failed to delete Gradle test init script:");
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

function stubBspUnavailable(): sinon.SinonStub {
    return sinon
        .stub(vscode.commands, "executeCommand")
        .rejects(new Error("Project is not a Gradle build server project: demo"));
}

function stubJavaDebug(): sinon.SinonStub {
    sinon.stub(vscode.extensions, "getExtension").returns({} as vscode.Extension<unknown>);
    sinon.stub(util, "waitOnTcp").resolves();
    return sinon.stub(vscode.debug, "startDebugging").resolves(true);
}

function buildDebugContext(testRunnerApi: ReturnType<typeof buildTestRunnerApi>): IRunTestContext {
    const context = buildRunContext(testRunnerApi, [
        { id: "class", parts: { project: "demo", class: "com.example.AppTest" } },
    ]);
    context.isDebug = true;
    return context;
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
