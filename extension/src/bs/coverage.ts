// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";

/**
 * The name of the Gradle task that produces the JaCoCo XML report. This is the
 * task auto-created by the `jacoco` plugin (`jacocoTestReport`), which we enable
 * XML output on and point at a per-run temp directory via the init script.
 */
export const JACOCO_REPORT_TASK = "jacocoTestReport";

/**
 * Describes the per-run temp locations used to carry JaCoCo coverage data out of
 * the delegated Gradle build and back into VS Code.
 */
export interface CoverageDescriptor {
    /**
     * Directory the generated JaCoCo XML report(s) are written to. One file is
     * produced per Gradle (sub)project so multi-project builds are supported.
     */
    reportDir: string;
}

/**
 * Create a unique per-run {@link CoverageDescriptor}. The directory is created
 * lazily by Gradle when it writes the report, so we only compute the path here.
 */
export function createCoverageDescriptor(): CoverageDescriptor {
    const reportDir = path.join(
        os.tmpdir(),
        `gradle-test-coverage-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    return { reportDir };
}

/**
 * Escape a string so it can be embedded inside a Groovy single-quoted literal.
 * Only backslashes and single quotes need escaping (Windows paths contain
 * backslashes, so this matters).
 */
function escapeGroovySingleQuoted(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Groovy init-script lines that transparently enable JaCoCo coverage for every
 * Java (sub)project's test tasks — without editing the user's build.gradle.
 *
 * For each project that has the `java` plugin we:
 *  - apply the `jacoco` plugin (which auto-creates a `jacocoTestReport` task
 *    already wired to the project's `test` execution data and main source set);
 *  - enable XML output on that report task and redirect it to our per-run temp
 *    directory so we can read it back and translate it into VS Code coverage;
 *  - order the report after the Test tasks so the `.exec` data exists first.
 *
 * The caller appends {@link JACOCO_REPORT_TASK} to the Gradle task list so the
 * report is generated in the same invocation as the tests.
 */
export function getCoverageInitScriptLines(descriptor: CoverageDescriptor): string[] {
    const reportDir = escapeGroovySingleQuoted(descriptor.reportDir);
    return [
        "allprojects { p ->",
        "    p.plugins.withId('java') {",
        "        if (!p.plugins.hasPlugin('jacoco')) {",
        "            p.apply plugin: 'jacoco'",
        "        }",
        "        p.tasks.matching { it.name == 'jacocoTestReport' }.configureEach { r ->",
        "            r.mustRunAfter(p.tasks.withType(Test))",
        // Only feed the report execution data files that actually exist. The
        // default report reads every Test task's `.exec`, which fails when a
        // `--tests`-filtered run leaves some Test tasks unexecuted.
        "            def execTree = p.fileTree(dir: p.layout.buildDirectory.dir('jacoco').get().asFile, include: '**/*.exec')",
        "            r.executionData.setFrom(execTree)",
        "            r.onlyIf { !execTree.isEmpty() }",
        "            r.reports {",
        "                it.xml.required.set(true)",
        "                it.html.required.set(false)",
        "                it.csv.required.set(false)",
        "                def reportName = p.path.replaceAll('[^A-Za-z0-9]', '_')",
        `                it.xml.outputLocation.set(new File('${reportDir}', 'jacoco' + reportName + '.xml'))`,
        "            }",
        "        }",
        "    }",
        "}",
    ];
}

/**
 * Parse the JaCoCo XML report(s) produced by the delegated build and push the
 * resulting line coverage into the VS Code {@link vscode.TestRun}.
 *
 * Coverage is surfaced two ways so it works regardless of how VS Code chooses to
 * consume it: a {@link vscode.FileCoverage} summary is added eagerly via
 * {@link vscode.TestRun.addCoverage}, and the per-line detail is cached and
 * served from {@link vscode.TestRunProfile.loadDetailedCoverage}.
 */
export async function collectCoverage(
    reportDir: string,
    workspaceFolder: vscode.WorkspaceFolder,
    testRun: vscode.TestRun,
    profile: vscode.TestRunProfile | undefined
): Promise<void> {
    let reportFiles: [string, vscode.FileType][];
    try {
        reportFiles = await vscode.workspace.fs.readDirectory(vscode.Uri.file(reportDir));
    } catch {
        // No report directory means the build never produced coverage (e.g. it
        // failed before the report task ran). Nothing to surface.
        return;
    }

    const detailsByUri = new Map<string, vscode.FileCoverageDetail[]>();
    const sourceFileCache = new Map<string, vscode.Uri | undefined>();

    for (const [name, type] of reportFiles) {
        if (type !== vscode.FileType.File || !name.endsWith(".xml")) {
            continue;
        }
        let xml: string;
        try {
            xml = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(reportDir, name)))).toString(
                "utf-8"
            );
        } catch {
            continue;
        }

        for (const sourceFile of parseJacocoXml(xml)) {
            const relativePath = sourceFile.packagePath
                ? `${sourceFile.packagePath}/${sourceFile.name}`
                : sourceFile.name;
            const uri = await resolveSourceFileUri(relativePath, workspaceFolder, sourceFileCache);
            if (!uri) {
                continue;
            }
            const key = uri.toString();
            const details = detailsByUri.get(key) ?? [];
            for (const line of sourceFile.lines) {
                // A line is executed when it has at least one covered instruction.
                const executed = line.coveredInstructions > 0;
                details.push(
                    new vscode.StatementCoverage(executed, new vscode.Position(Math.max(0, line.number - 1), 0))
                );
            }
            detailsByUri.set(key, details);
        }
    }

    if (detailsByUri.size === 0) {
        return;
    }

    for (const [uriString, details] of detailsByUri) {
        testRun.addCoverage(vscode.FileCoverage.fromDetails(vscode.Uri.parse(uriString), details));
    }

    if (profile) {
        // VS Code invokes this lazily when the user drills into a file's coverage.
        profile.loadDetailedCoverage = async (_run, fileCoverage) =>
            detailsByUri.get(fileCoverage.uri.toString()) ?? [];
    }
}

interface JacocoSourceFile {
    packagePath: string;
    name: string;
    lines: { number: number; coveredInstructions: number; missedInstructions: number }[];
}

/**
 * Regex-based parser for a JaCoCo XML report. We deliberately avoid pulling in an
 * XML dependency to match the lightweight parsing used elsewhere in this module
 * (see testResultParser.ts).
 *
 * JaCoCo XML shape:
 *   <report name="...">
 *     <package name="com/example">
 *       <sourcefile name="Foo.java">
 *         <line nr="10" mi="0" ci="4" mb="0" cb="0"/>
 *       </sourcefile>
 *     </package>
 *   </report>
 */
export function parseJacocoXml(xml: string): JacocoSourceFile[] {
    const sourceFiles: JacocoSourceFile[] = [];
    const packageRegex = /<package\s+name="([^"]*)"\s*>([\s\S]*?)<\/package>/g;
    let packageMatch: RegExpExecArray | null;
    while ((packageMatch = packageRegex.exec(xml)) !== null) {
        const packagePath = packageMatch[1];
        const packageBody = packageMatch[2];
        const sourceFileRegex = /<sourcefile\s+name="([^"]*)"\s*>([\s\S]*?)<\/sourcefile>/g;
        let sourceFileMatch: RegExpExecArray | null;
        while ((sourceFileMatch = sourceFileRegex.exec(packageBody)) !== null) {
            const name = sourceFileMatch[1];
            const body = sourceFileMatch[2];
            const lines: JacocoSourceFile["lines"] = [];
            const lineRegex = /<line\b([^>]*)\/?>/g;
            let lineMatch: RegExpExecArray | null;
            while ((lineMatch = lineRegex.exec(body)) !== null) {
                const attrs = lineMatch[1];
                const number = parseIntAttr(attrs, "nr");
                if (number === undefined) {
                    continue;
                }
                lines.push({
                    number,
                    coveredInstructions: parseIntAttr(attrs, "ci") ?? 0,
                    missedInstructions: parseIntAttr(attrs, "mi") ?? 0,
                });
            }
            if (lines.length > 0) {
                sourceFiles.push({ packagePath, name, lines });
            }
        }
    }
    return sourceFiles;
}

function parseIntAttr(attrs: string, name: string): number | undefined {
    const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(attrs);
    if (!match) {
        return undefined;
    }
    const value = parseInt(match[1], 10);
    return Number.isFinite(value) ? value : undefined;
}

async function resolveSourceFileUri(
    relativePath: string,
    workspaceFolder: vscode.WorkspaceFolder,
    cache: Map<string, vscode.Uri | undefined>
): Promise<vscode.Uri | undefined> {
    if (cache.has(relativePath)) {
        return cache.get(relativePath);
    }
    const pattern = new vscode.RelativePattern(workspaceFolder, `**/${relativePath}`);
    const matches = await vscode.workspace.findFiles(pattern, null, 1);
    const uri = matches.length > 0 ? matches[0] : undefined;
    cache.set(relativePath, uri);
    return uri;
}
