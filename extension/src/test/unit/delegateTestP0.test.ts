import * as assert from "assert";
import * as vscode from "vscode";
import { CoverageDescriptor, getCoverageInitScriptLines, parseJacocoXml, pickBestSourceMatch } from "../../bs/coverage";
import { getSuiteName } from "../testUtil";

/**
 * Unit tests for the P0 "Delegate Test to Gradle" default-experience work
 * (vscode-gradle#1890): JaCoCo coverage parsing.
 */
describe(getSuiteName("Delegate test P0 helpers"), () => {
    describe("parseJacocoXml", () => {
        it("parses per-line covered/missed instructions grouped by source file", () => {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="test">
  <package name="com/example">
    <sourcefile name="Foo.java">
      <line nr="3" mi="0" ci="4" mb="0" cb="0"/>
      <line nr="4" mi="2" ci="0" mb="0" cb="0"/>
      <counter type="LINE" missed="1" covered="1"/>
    </sourcefile>
  </package>
</report>`;
            const files = parseJacocoXml(xml);
            assert.strictEqual(files.length, 1);
            assert.strictEqual(files[0].packagePath, "com/example");
            assert.strictEqual(files[0].name, "Foo.java");
            assert.strictEqual(files[0].lines.length, 2);
            assert.deepStrictEqual(files[0].lines[0], {
                number: 3,
                coveredInstructions: 4,
                missedInstructions: 0,
                coveredBranches: 0,
                missedBranches: 0,
            });
            assert.deepStrictEqual(files[0].lines[1], {
                number: 4,
                coveredInstructions: 0,
                missedInstructions: 2,
                coveredBranches: 0,
                missedBranches: 0,
            });
        });

        it("parses per-line covered/missed branches (cb/mb)", () => {
            const xml = `<report>
  <package name="com/example">
    <sourcefile name="Branchy.java">
      <line nr="10" mi="0" ci="6" mb="1" cb="3"/>
    </sourcefile>
  </package>
</report>`;
            const files = parseJacocoXml(xml);
            assert.strictEqual(files.length, 1);
            assert.deepStrictEqual(files[0].lines[0], {
                number: 10,
                coveredInstructions: 6,
                missedInstructions: 0,
                coveredBranches: 3,
                missedBranches: 1,
            });
        });

        it("handles multiple packages and source files", () => {
            const xml = `<report>
  <package name="a">
    <sourcefile name="A.java"><line nr="1" ci="1" mi="0"/></sourcefile>
  </package>
  <package name="b/c">
    <sourcefile name="B.java"><line nr="7" ci="0" mi="3"/></sourcefile>
  </package>
</report>`;
            const files = parseJacocoXml(xml);
            assert.strictEqual(files.length, 2);
            assert.strictEqual(files[0].packagePath, "a");
            assert.strictEqual(files[1].packagePath, "b/c");
            assert.strictEqual(files[1].lines[0].number, 7);
            assert.strictEqual(files[1].lines[0].coveredInstructions, 0);
        });

        it("returns an empty array for a report with no line data", () => {
            const xml = `<report><package name="x"><sourcefile name="X.java"></sourcefile></package></report>`;
            assert.deepStrictEqual(parseJacocoXml(xml), []);
        });
    });

    it("isolates execution data for each coverage run", () => {
        const descriptor: CoverageDescriptor = {
            rootDir: "C:\\temp\\coverage",
            reportDir: "C:\\temp\\coverage\\reports",
            executionDataDir: "C:\\temp\\coverage\\execution-data",
        };
        const script = getCoverageInitScriptLines(descriptor).join("\n");

        assert.match(script, /coverageExecDir = new File\('C:\\\\temp\\\\coverage\\\\execution-data'/);
        assert.match(script, /destinationFile = new File\(coverageExecDir/);
        assert.match(script, /fileTree\(dir: coverageExecDir/);
        assert.doesNotMatch(script, /buildDirectory\.dir\('jacoco'\)/);
    });

    it("prefers main sources over test and generated sources", () => {
        const selected = pickBestSourceMatch([
            { uri: vscode.Uri.file("C:\\workspace\\src\\test\\java\\Foo.java"), isTest: true, generated: false },
            {
                uri: vscode.Uri.file("C:\\workspace\\build\\generated\\sources\\Foo.java"),
                isTest: false,
                generated: true,
            },
            { uri: vscode.Uri.file("C:\\workspace\\src\\main\\java\\Foo.java"), isTest: false, generated: false },
        ]);

        assert.strictEqual(selected?.fsPath, vscode.Uri.file("C:\\workspace\\src\\main\\java\\Foo.java").fsPath);
    });
});
