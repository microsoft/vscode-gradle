// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { escapeGroovySingleQuoted } from "./groovy";

export const JACOCO_REPORT_TASK = "jacocoTestReport";

export interface CoverageDescriptor {
    rootDir: string;
    reportDir: string;
    executionDataDir: string;
}

export interface CoverageSourceRoot {
    uri: vscode.Uri;
    isTest: boolean;
    generated: boolean;
}

export function createCoverageDescriptor(): CoverageDescriptor {
    const rootDir = path.join(
        os.tmpdir(),
        `gradle-test-coverage-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    return {
        rootDir,
        reportDir: path.join(rootDir, "reports"),
        executionDataDir: path.join(rootDir, "execution-data"),
    };
}

/**
 * Enable JaCoCo without changing the user's build files.
 */
export function getCoverageInitScriptLines(descriptor: CoverageDescriptor): string[] {
    const reportDir = escapeGroovySingleQuoted(descriptor.reportDir);
    const executionDataDir = escapeGroovySingleQuoted(descriptor.executionDataDir);
    return [
        "allprojects { p ->",
        "    p.plugins.withId('java') {",
        "        if (!p.plugins.hasPlugin('jacoco')) {",
        "            p.apply plugin: 'jacoco'",
        "            p.jacoco { toolVersion = '0.8.15' }",
        "        }",
        "        def coverageProjectId = p.path.replaceAll('[^A-Za-z0-9]', '_') + '_' + Integer.toHexString(p.path.hashCode())",
        `        def coverageExecDir = new File('${executionDataDir}', coverageProjectId)`,
        "        p.tasks.matching { it.name == 'jacocoTestReport' }.configureEach { r ->",
        "            r.mustRunAfter(p.tasks.withType(Test))",
        "            def execTree = p.fileTree(dir: coverageExecDir, include: '**/*.exec')",
        "            r.executionData.setFrom(execTree)",
        "            r.onlyIf { !execTree.isEmpty() }",
        "            r.reports {",
        "                it.xml.required.set(true)",
        "                it.html.required.set(false)",
        "                it.csv.required.set(false)",
        `                it.xml.outputLocation.set(new File('${reportDir}', 'jacoco' + coverageProjectId + '.xml'))`,
        "            }",
        "        }",
        "        p.tasks.withType(Test).configureEach { t ->",
        "            def execName = t.name.replaceAll('[^A-Za-z0-9]', '_') + '_' + Integer.toHexString(t.path.hashCode())",
        "            t.extensions.getByType(org.gradle.testing.jacoco.plugins.JacocoTaskExtension).destinationFile = new File(coverageExecDir, 'jacoco' + execName + '.exec')",
        "            t.finalizedBy(p.tasks.matching { it.name == 'jacocoTestReport' })",
        "        }",
        "    }",
        "}",
    ];
}

export async function collectCoverage(
    reportDir: string,
    workspaceFolder: vscode.WorkspaceFolder,
    testRun: vscode.TestRun,
    profile: vscode.TestRunProfile | undefined,
    sourceRoots: CoverageSourceRoot[] = []
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

    detailsByRun.set(testRun, detailsByUri);

    for (const [uriString, details] of detailsByUri) {
        testRun.addCoverage(vscode.FileCoverage.fromDetails(vscode.Uri.parse(uriString), details));
    }

    if (profile) {
        profile.loadDetailedCoverage = async (run, fileCoverage) =>
            detailsByRun.get(run)?.get(fileCoverage.uri.toString()) ?? [];
    }
}

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
    sourceRoots: CoverageSourceRoot[]
): Promise<vscode.Uri | undefined> {
    if (cache.has(relativePath)) {
        return cache.get(relativePath);
    }
    const segments = relativePath.split("/");
    const candidates: CoverageSourceRoot[] = [];
    for (const root of sourceRoots) {
        const candidate = vscode.Uri.joinPath(root.uri, ...segments);
        try {
            await vscode.workspace.fs.stat(candidate);
            candidates.push({ ...root, uri: candidate });
        } catch {
            // Try the next source root.
        }
    }
    if (candidates.length > 0) {
        const uri = pickBestSourceMatch(candidates);
        cache.set(relativePath, uri);
        return uri;
    }

    const pattern = new vscode.RelativePattern(workspaceFolder, `**/${relativePath}`);
    const matches = await vscode.workspace.findFiles(pattern, null, 16);
    const uri = pickBestSourceMatch(
        matches.map((uri) => ({
            uri,
            isTest: /\/src\/test\//i.test(uri.path),
            generated: /\/(?:build|generated)\//i.test(uri.path),
        }))
    );
    cache.set(relativePath, uri);
    return uri;
}

export function pickBestSourceMatch(matches: readonly CoverageSourceRoot[]): vscode.Uri | undefined {
    if (matches.length === 0) {
        return undefined;
    }
    return [...matches].sort(
        (a, b) => sourceMatchScore(a) - sourceMatchScore(b) || a.uri.path.localeCompare(b.uri.path)
    )[0].uri;
}

function sourceMatchScore(match: CoverageSourceRoot): number {
    const normalizedPath = match.uri.path.replace(/\\/g, "/");
    return (
        (match.isTest ? 100 : 0) +
        (match.generated ? 10 : 0) +
        (/\/src\/main\//i.test(normalizedPath) ? 0 : /\/src\//i.test(normalizedPath) ? 1 : 2)
    );
}
