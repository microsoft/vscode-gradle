import * as assert from "assert";
import { parseJacocoXml } from "../../bs/coverage";
import { describeDelegationFix, isDelegationFixableFailure } from "../../bs/escalation";
import { getSuiteName } from "../testUtil";

/**
 * Unit tests for the P0 "Delegate Test to Gradle" default-experience work
 * (vscode-gradle#1890): JaCoCo coverage parsing and failure-driven escalation.
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
            assert.deepStrictEqual(files[0].lines[0], { number: 3, coveredInstructions: 4, missedInstructions: 0 });
            assert.deepStrictEqual(files[0].lines[1], { number: 4, coveredInstructions: 0, missedInstructions: 2 });
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

    describe("isDelegationFixableFailure", () => {
        it("matches JPMS module-access failures", () => {
            assert.ok(
                isDelegationFixableFailure(
                    'java.lang.reflect.InaccessibleObjectException: Unable to make field accessible: module java.base does not "opens java.lang"'
                )
            );
            assert.ok(isDelegationFixableFailure("IllegalAccessException: class Foo cannot access class Bar"));
        });

        it("matches missing/stale resource failures", () => {
            assert.ok(isDelegationFixableFailure("Could not find application.properties on the classpath"));
        });

        it("does not match generic assertion failures", () => {
            assert.strictEqual(
                isDelegationFixableFailure("org.opentest4j.AssertionFailedError: expected <1> but was <2>"),
                false
            );
            assert.strictEqual(isDelegationFixableFailure(undefined), false);
        });
    });

    describe("describeDelegationFix", () => {
        it("explains module-access failures", () => {
            const reason = describeDelegationFix("module java.base does not open java.lang");
            assert.ok(reason && reason.includes("module-access"));
        });

        it("returns undefined when nothing matches", () => {
            assert.strictEqual(describeDelegationFix("some unrelated failure"), undefined);
        });
    });
});
