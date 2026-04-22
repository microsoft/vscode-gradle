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

export interface ParseTestResultsOptions {
    /**
     * Fully-qualified class names that were requested in this run. Only result
     * files for these classes (and their nested classes) will be parsed. Leave
     * undefined / empty to parse all result files.
     */
    classNames?: ReadonlySet<string>;

    /**
     * Epoch millis; only result files with mtime >= this value will be parsed.
     * Guards against stale XML files left over from previous test runs.
     */
    minMtime?: number;

    /**
     * Gradle task directory under `build/test-results/` to scan. Defaults to `"test"`.
     */
    taskName?: string;
}

/**
 * Parses JUnit XML test result files from the Gradle build output directory.
 *
 * Gradle writes standard JUnit XML per test class to
 * `<projectDir>/build/test-results/<taskName>/TEST-<fqcn>.xml` — and for
 * multi-project builds, to the equivalent path inside each sub-project. This
 * function recursively scans the workspace to find all such files.
 *
 * The optional `classNames` / `minMtime` in `options` narrow the file set to
 * only those produced by the current run, which prevents stale results from
 * previous runs being reported as fresh.
 */
export async function parseTestResults(
    workspaceFolder: vscode.WorkspaceFolder,
    options: ParseTestResultsOptions = {}
): Promise<TestCaseResult[]> {
    const taskName = options.taskName ?? "test";
    const classNames = options.classNames;
    const minMtime = options.minMtime;

    const pattern = new vscode.RelativePattern(workspaceFolder, `**/build/test-results/${taskName}/TEST-*.xml`);
    // Pass `null` for exclude so default search.exclude / files.exclude (which
    // typically hide build/ output) do not cause us to miss result files.
    const fileUris = await vscode.workspace.findFiles(pattern, null);

    const results: TestCaseResult[] = [];
    for (const fileUri of fileUris) {
        const fileName = basename(fileUri.path);
        if (classNames && classNames.size > 0) {
            const fileClass = classFromResultFileName(fileName);
            if (!fileClass || !matchesAnyClass(fileClass, classNames)) {
                continue;
            }
        }

        if (minMtime !== undefined) {
            try {
                const stat = await vscode.workspace.fs.stat(fileUri);
                if (stat.mtime < minMtime) {
                    continue;
                }
            } catch {
                continue;
            }
        }

        try {
            const content = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString("utf-8");
            results.push(...parseJUnitXml(content));
        } catch {
            // skip unreadable files
        }
    }

    return results;
}

function basename(p: string): string {
    const i = p.lastIndexOf("/");
    return i >= 0 ? p.substring(i + 1) : p;
}

/**
 * Extracts the fully-qualified class name from a Gradle JUnit result filename
 * of the form `TEST-<fqcn>.xml`. Returns undefined for files that don't match.
 */
function classFromResultFileName(fileName: string): string | undefined {
    if (!fileName.startsWith("TEST-") || !fileName.endsWith(".xml")) {
        return undefined;
    }
    return fileName.substring("TEST-".length, fileName.length - ".xml".length);
}

/**
 * A file class matches a requested class if it equals the requested name or
 * if it is a nested class of it (e.g. `com.foo.Bar$Inner` matches `com.foo.Bar`).
 */
function matchesAnyClass(fileClass: string, requested: ReadonlySet<string>): boolean {
    if (requested.has(fileClass)) {
        return true;
    }
    for (const cls of requested) {
        if (fileClass.startsWith(cls + "$")) {
            return true;
        }
    }
    return false;
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
        let duration: number | undefined;
        if (timeStr) {
            const seconds = parseFloat(timeStr);
            if (Number.isFinite(seconds)) {
                duration = Math.round(seconds * 1000);
            }
        }

        let state: TestResultState = TestResultState.Passed;
        let message: string | undefined;

        // Capture the opening tag's attributes (may be self-closing `/>` or a full tag followed by body).
        const failureMatch = /<failure\b([^>]*?)(?:\/>|>([\s\S]*?)<\/failure>)/i.exec(body);
        const errorMatch = /<error\b([^>]*?)(?:\/>|>([\s\S]*?)<\/error>)/i.exec(body);
        const skippedMatch = /<skipped\b/i.exec(body);

        if (failureMatch) {
            state = TestResultState.Failed;
            message = resolveFailureMessage(failureMatch[1], failureMatch[2]);
        } else if (errorMatch) {
            state = TestResultState.Errored;
            message = resolveFailureMessage(errorMatch[1], errorMatch[2]);
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

/**
 * Resolve a human-readable failure/error message from a `<failure>` or `<error>` element.
 *
 * Standard Gradle-produced JUnit XML looks like:
 *   <failure message="expected 1 but was 2" type="AssertionError">stacktrace...</failure>
 * but the body can also be empty (self-closing `<failure .../>` or `<failure ...></failure>`),
 * in which case we must fall back to the `message` attribute — otherwise the test shows up
 * as failed with no diagnostic at all.
 *
 * When both are present we prefer `message\nbody` so the short summary stays visible even
 * if the stacktrace is long.
 */
function resolveFailureMessage(rawAttrs: string | undefined, rawBody: string | undefined): string | undefined {
    const body = rawBody?.trim();
    const msgAttr = rawAttrs ? getAttr(rawAttrs, "message") : undefined;
    if (body && msgAttr && !body.startsWith(msgAttr)) {
        return `${msgAttr}\n${body}`;
    }
    if (body) {
        return body;
    }
    return msgAttr;
}

function decodeXmlEntities(str: string): string {
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}
