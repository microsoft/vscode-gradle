// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { escapeGroovySingleQuoted } from "./groovy";

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
 * Groovy init-script lines that transparently enable JaCoCo coverage for every
 * Java (sub)project's test tasks — without editing the user's build.gradle.
 *
 * For each project that has the `java` plugin we:
 *  - apply the `jacoco` plugin (which auto-creates a `jacocoTestReport` task
 *    already wired to the project's `test` execution data and main source set),
 *    pinning a recent JaCoCo tool version so coverage still works on modern JDKs
 *    (Gradle's bundled default is often too old and fails to instrument classes
 *    compiled for newer bytecode). We only pin when we applied the plugin
 *    ourselves, so a project that manages its own JaCoCo version is left intact;
 *  - enable XML output on that report task and redirect it to our per-run temp
 *    directory so we can read it back and translate it into VS Code coverage;
 *  - order the report after the Test tasks so the `.exec` data exists first;
 *  - wire the report as a `finalizedBy` of every Test task, so the BSP path
 *    (whose TestLauncher can only run tests, not tasks) still produces the
 *    report in the same invocation.
 *
 * The task-server fallback path additionally appends {@link JACOCO_REPORT_TASK}
 * to the Gradle task list; the finalizer makes the report run on the BSP path
 * too, and Gradle de-duplicates so it executes exactly once either way.
 */
export function getCoverageInitScriptLines(descriptor: CoverageDescriptor): string[] {
    const reportDir = escapeGroovySingleQuoted(descriptor.reportDir);
    return [
        "allprojects { p ->",
        "    p.plugins.withId('java') {",
        "        if (!p.plugins.hasPlugin('jacoco')) {",
        "            p.apply plugin: 'jacoco'",
        // Pin a recent JaCoCo so instrumentation succeeds on current JDKs; only
        // applied when we added the plugin, leaving user-managed versions alone.
        "            p.jacoco { toolVersion = '0.8.15' }",
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
        // Wire the report as a finalizer of every Test task. This lets the BSP
        // TestLauncher path — which can only run tests, not tasks — still emit
        // the report in the same invocation: Gradle runs the finalizer once the
        // tests finish. The task-server path also lists the report task
        // explicitly; Gradle de-duplicates, so it still runs exactly once.
        "        p.tasks.withType(Test).configureEach { t ->",
        "            t.finalizedBy(p.tasks.matching { it.name == 'jacocoTestReport' })",
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
    profile: vscode.TestRunProfile | undefined,
    sourceRoots: vscode.Uri[] = []
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
            const uri = await resolveSourceFileUri(relativePath, workspaceFolder, sourceFileCache, sourceRoots);
            if (!uri) {
                continue;
            }
            const key = uri.toString();
            const details = detailsByUri.get(key) ?? [];
            for (const line of sourceFile.lines) {
                // A line is executed when it has at least one covered instruction.
                const executed = line.coveredInstructions > 0;
                const position = new vscode.Position(Math.max(0, line.number - 1), 0);
                // JaCoCo reports covered/missed branch counts per line (cb/mb) but
                // not per-branch detail, so synthesize one BranchCoverage entry per
                // covered/missed branch to surface branch coverage in VS Code.
                const branches: vscode.BranchCoverage[] = [];
                for (let i = 0; i < line.coveredBranches; i++) {
                    branches.push(new vscode.BranchCoverage(true, position));
                }
                for (let i = 0; i < line.missedBranches; i++) {
                    branches.push(new vscode.BranchCoverage(false, position));
                }
                details.push(
                    branches.length > 0
                        ? new vscode.StatementCoverage(executed, position, branches)
                        : new vscode.StatementCoverage(executed, position)
                );
            }
            detailsByUri.set(key, details);
        }
    }

    if (detailsByUri.size === 0) {
        return;
    }

    // Cache this run's details keyed by the run itself so the lazily-invoked
    // loadDetailedCoverage handler serves the right data even after later
    // coverage runs. The handler is shared on the profile, but routes by the
    // `run` argument; the WeakMap lets old runs' details be GC'd.
    detailsByRun.set(testRun, detailsByUri);

    for (const [uriString, details] of detailsByUri) {
        testRun.addCoverage(vscode.FileCoverage.fromDetails(vscode.Uri.parse(uriString), details));
    }

    if (profile) {
        // VS Code invokes this lazily when the user drills into a file's coverage.
        // Route by `run` so a drill-in on an earlier run doesn't return a later
        // run's data (the profile — and thus this handler — is shared across runs).
        profile.loadDetailedCoverage = async (run, fileCoverage) =>
            detailsByRun.get(run)?.get(fileCoverage.uri.toString()) ?? [];
    }
}

/**
 * Per-run cache of file coverage details, so {@link vscode.TestRunProfile.loadDetailedCoverage}
 * can serve the correct run's data. Keyed weakly by the run so entries are
 * collected once VS Code discards the run.
 */
const detailsByRun = new WeakMap<vscode.TestRun, Map<string, vscode.FileCoverageDetail[]>>();

interface JacocoSourceFile {
    packagePath: string;
    name: string;
    lines: {
        number: number;
        coveredInstructions: number;
        missedInstructions: number;
        coveredBranches: number;
        missedBranches: number;
    }[];
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
                    coveredBranches: parseIntAttr(attrs, "cb") ?? 0,
                    missedBranches: parseIntAttr(attrs, "mb") ?? 0,
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
    cache: Map<string, vscode.Uri | undefined>,
    sourceRoots: vscode.Uri[]
): Promise<vscode.Uri | undefined> {
    if (cache.has(relativePath)) {
        return cache.get(relativePath);
    }
    // Prefer the authoritative BSP source roots for this project (from
    // `buildTarget/sources`). Resolving against them eliminates the multi-module
    // ambiguity of a workspace-wide glob: the same package-relative path can
    // exist in several modules, but only the module under coverage owns the file.
    const segments = relativePath.split("/");
    for (const root of sourceRoots) {
        const candidate = vscode.Uri.joinPath(root, ...segments);
        try {
            await vscode.workspace.fs.stat(candidate);
            cache.set(relativePath, candidate);
            return candidate;
        } catch {
            // Not under this source root; try the next.
        }
    }
    // Fallback (e.g. BSP unavailable / task-server path): a workspace-wide glob.
    // A workspace can contain the same package-relative path in several modules
    // (e.g. multi-project builds) or under both main and test source roots. Fetch
    // several candidates and prefer a main production source so coverage lands on
    // the right file instead of an arbitrary first match.
    const pattern = new vscode.RelativePattern(workspaceFolder, `**/${relativePath}`);
    const matches = await vscode.workspace.findFiles(pattern, null, 16);
    const uri = pickBestSourceMatch(matches);
    cache.set(relativePath, uri);
    return uri;
}

/**
 * Choose the most likely production source file among candidates that share the
 * same package-relative path. Prefers a conventional main source root, then any
 * source root, then the first match. Returns undefined when there are none.
 */
function pickBestSourceMatch(matches: readonly vscode.Uri[]): vscode.Uri | undefined {
    if (matches.length === 0) {
        return undefined;
    }
    const normalized = matches.map((uri) => ({ uri, p: uri.path.replace(/\\/g, "/") }));
    return (
        normalized.find((m) => /\/src\/main\//i.test(m.p))?.uri ??
        normalized.find((m) => /\/src\//i.test(m.p))?.uri ??
        normalized[0].uri
    );
}
