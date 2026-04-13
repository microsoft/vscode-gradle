import * as vscode from "vscode";
import { TestResultState } from "../java-test-runner.api";

export interface TestCaseResult {
    className: string;
    methodName: string;
    displayName?: string;
    duration?: number;
    state: TestResultState;
    message?: string;
}

/**
 * Parses JUnit XML test result files from the Gradle build output directory.
 * Gradle writes standard JUnit XML to `build/test-results/<taskName>/`.
 */
export async function parseTestResults(projectDir: vscode.Uri, taskName: string = "test"): Promise<TestCaseResult[]> {
    const resultsDir = vscode.Uri.joinPath(projectDir, "build", "test-results", taskName);
    const results: TestCaseResult[] = [];

    let files: [string, vscode.FileType][];
    try {
        files = await vscode.workspace.fs.readDirectory(resultsDir);
    } catch {
        return results;
    }

    for (const [fileName, fileType] of files) {
        if (fileType !== vscode.FileType.File || !fileName.endsWith(".xml")) {
            continue;
        }
        const fileUri = vscode.Uri.joinPath(resultsDir, fileName);
        try {
            const content = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString("utf-8");
            results.push(...parseJUnitXml(content));
        } catch {
            // skip unreadable files
        }
    }

    return results;
}

/**
 * Parses a single JUnit XML file content into test case results.
 *
 * JUnit XML format:
 * <testsuite name="com.example.MyTest" tests="2" failures="1" errors="0" skipped="0" time="0.123">
 *   <testcase name="testMethod" classname="com.example.MyTest" time="0.05">
 *     <failure message="expected ...">stack trace</failure>
 *   </testcase>
 *   <testcase name="testOther" classname="com.example.MyTest" time="0.01"/>
 * </testsuite>
 */
function parseJUnitXml(xml: string): TestCaseResult[] {
    const results: TestCaseResult[] = [];
    const testCaseRegex = /<testcase\s+([^>]*)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    let match: RegExpExecArray | null;

    while ((match = testCaseRegex.exec(xml)) !== null) {
        const attrs = match[1];
        const body = match[2] || "";

        const methodName = getAttr(attrs, "name");
        const className = getAttr(attrs, "classname");
        if (!methodName || !className) {
            continue;
        }

        const timeStr = getAttr(attrs, "time");
        const duration = timeStr ? Math.round(parseFloat(timeStr) * 1000) : undefined;

        let state: TestResultState = TestResultState.Passed;
        let message: string | undefined;

        const failureMatch = /<failure\b[^>]*>([\s\S]*?)<\/failure>/i.exec(body);
        const errorMatch = /<error\b[^>]*>([\s\S]*?)<\/error>/i.exec(body);
        const skippedMatch = /<skipped\b/i.exec(body);

        if (failureMatch) {
            state = TestResultState.Failed;
            message = failureMatch[1]?.trim();
        } else if (errorMatch) {
            state = TestResultState.Errored;
            message = errorMatch[1]?.trim();
        } else if (skippedMatch) {
            state = TestResultState.Skipped;
        }

        results.push({
            className,
            methodName,
            displayName: methodName,
            duration,
            state,
            message,
        });
    }

    return results;
}

function getAttr(attrs: string, name: string): string | undefined {
    const regex = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
    const match = regex.exec(attrs);
    return match ? decodeXmlEntities(match[1]) : undefined;
}

function decodeXmlEntities(str: string): string {
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}
