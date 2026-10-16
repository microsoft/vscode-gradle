import * as path from "path";
import * as os from "os";
import * as fs from "fs-extra";

import { runTests as runVSCodeTests, downloadAndUnzipVSCode, TestOptions } from "@vscode/test-electron";
import { VSCODE_TEST_VERSIONS } from "./vscode-version";

const extensionDevelopmentPath = path.resolve(__dirname, "../../");

async function runTests(options: TestOptions): Promise<number> {
    const logsRoot = path.join(extensionDevelopmentPath, ".vscode-test", "logs");
    await fs.ensureDir(logsRoot);
    const logsPath = await fs.mkdtemp(path.join(logsRoot, "run-"));
    console.log(`VS Code test logs: ${logsPath}`);
    console.log(`Test JAVA_HOME: ${process.env.JAVA_HOME || "(unset)"}`);
    console.log(`Test VSCODE_JAVA_HOME: ${process.env.VSCODE_JAVA_HOME || "(unset)"}`);
    try {
        return await runVSCodeTests({
            ...options,
            launchArgs: [...(options.launchArgs || []), `--logsPath=${logsPath}`],
        });
    } catch (error) {
        try {
            await printFailureLogs(logsPath);
        } catch (logError) {
            console.error("Unable to read VS Code test logs:", logError);
        }
        throw error;
    }
}

async function printFailureLogs(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            await printFailureLogs(file);
        } else if (entry.name === "exthost.log" || /Gradle.*\.log$/.test(entry.name)) {
            const content = await fs.readFile(file, "utf8");
            console.error(`--- ${file} (last 200 lines) ---`);
            console.error(content.split(/\r?\n/).slice(-200).join("\n"));
        }
    }
}

async function runTestsWithGradle(vscodeExecutablePath: string, userDir: string): Promise<void> {
    const fixtures = [
        "gradle-groovy-default-build-file",
        "gradle-kotlin-default-build-file",
        "gradle-groovy-custom-build-file",
    ];
    for (const fixture of fixtures) {
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath: path.resolve(__dirname, "integration", "gradle"),
            launchArgs: [
                path.resolve(__dirname, `../../test-fixtures/${fixture}`),
                "--disable-extensions",
                "--disable-gpu",
                `--user-data-dir=${userDir}`,
            ],
            extensionTestsEnv: {
                FIXTURE_NAME: fixture,
                SUITE_NAME: "Run tests with Gradle",
                VSCODE_TEST: "true",
            },
        });
    }
}

async function runNetworkTestsWithGradle(vscodeExecutablePath: string, userDir: string): Promise<void> {
    const fixture = "gradle-groovy-default-build-file";
    await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath: path.resolve(__dirname, "integration", "gradle"),
        launchArgs: [
            path.resolve(__dirname, `../../test-fixtures/${fixture}`),
            "--disable-extensions",
            "--disable-gpu",
            `--user-data-dir=${userDir}`,
        ],
        extensionTestsEnv: {
            FIXTURE_NAME: fixture,
            VSCODE_TEST: "true",
            SUITE_NAME: "Run network tests with Gradle",
            http_proxy: "http://0.0.0.0",
        },
    });
}

async function runNestedProjectTests(vscodeExecutablePath: string, userDir: string): Promise<void> {
    await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath: path.resolve(__dirname, "integration", "nested-projects"),
        launchArgs: [
            path.resolve(__dirname, `../../test-fixtures`),
            "--disable-extensions",
            "--disable-gpu",
            `--user-data-dir=${userDir}`,
        ],
        extensionTestsEnv: {
            FIXTURE_NAME: "test-fixtures",
            VSCODE_TEST: "true",
            SUITE_NAME: "Run nested project tests",
        },
    });
}

async function runUnitTests(vscodeExecutablePath: string, userDir: string): Promise<void> {
    const fixture = "no-gradle";
    await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath: path.resolve(__dirname, "unit"),
        launchArgs: [
            path.resolve(__dirname, `../../test-fixtures/${fixture}`),
            "--disable-extensions",
            "--disable-gpu",
            `--user-data-dir=${userDir}`,
        ],
        extensionTestsEnv: {
            FIXTURE_NAME: fixture,
            VSCODE_TEST: "true",
            SUITE_NAME: "Run unit tests",
        },
    });
}

function runTestsWithoutGradle(vscodeExecutablePath: string, userDir: string): Promise<number> {
    return runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath: path.resolve(__dirname, "integration", "no-gradle"),
        launchArgs: [
            path.resolve(__dirname, "../../test-fixtures/no-gradle"),
            "--disable-extensions",
            "--disable-gpu",
            `--user-data-dir=${userDir}`,
        ],
        extensionTestsEnv: {
            VSCODE_TEST: "true",
            SUITE_NAME: "Run tests without Gradle",
        },
    });
}

function runTestsWithMultiRoot(vscodeExecutablePath: string, userDir: string): Promise<number> {
    return runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath: path.resolve(__dirname, "integration", "multi-root"),
        launchArgs: [
            path.resolve(__dirname, "../../test-fixtures/multi-root/multiple-project.code-workspace"),
            "--disable-extensions",
            "--disable-gpu",
            `--user-data-dir=${userDir}`,
        ],
        extensionTestsEnv: {
            FIXTURE_NAME: "multi-root",
            VSCODE_TEST: "true",
            SUITE_NAME: "Run tests with multi-root vscode project",
        },
    });
}

function runTestsWithMultiProject(vscodeExecutablePath: string, userDir: string): Promise<number> {
    return runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath: path.resolve(__dirname, "integration", "multi-project"),
        launchArgs: [
            path.resolve(__dirname, "../../test-fixtures/multi-project/"),
            "--disable-extensions",
            "--disable-gpu",
            `--user-data-dir=${userDir}`,
        ],
        extensionTestsEnv: {
            FIXTURE_NAME: "multi-project",
            VSCODE_TEST: "true",
            SUITE_NAME: "Run tests with Gradle multi-project",
        },
    });
}

async function runTestsForVsCodeVersion(version?: string): Promise<void> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-user"));
    fs.copySync(path.resolve(__dirname, "../../test-fixtures/vscode-user/User"), path.join(tmpDir, "User"));
    const vscodeExecutablePath = await downloadAndUnzipVSCode(version);

    try {
        await runUnitTests(vscodeExecutablePath, tmpDir);
        await runTestsWithGradle(vscodeExecutablePath, tmpDir);
        await runNetworkTestsWithGradle(vscodeExecutablePath, tmpDir);
        await runTestsWithMultiRoot(vscodeExecutablePath, tmpDir);
        await runTestsWithMultiProject(vscodeExecutablePath, tmpDir);
        await runNestedProjectTests(vscodeExecutablePath, tmpDir);
        await runTestsWithoutGradle(vscodeExecutablePath, tmpDir);
    } catch (err) {
        console.error("Error running tests:", err.message);
        process.exit(1);
    }
}

async function main(): Promise<void> {
    for (const version of VSCODE_TEST_VERSIONS) {
        await runTestsForVsCodeVersion(version);
    }
    // run tests on the latest version
    await runTestsForVsCodeVersion();
    console.log("Finished running tests");
    process.exit(0);
}

void main();
