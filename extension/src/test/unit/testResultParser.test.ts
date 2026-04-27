import * as assert from "assert";
import { parseJUnitXml } from "../../bs/testResultParser";
import { TestResultState } from "../../java-test-runner.api";
import { getSuiteName } from "../testUtil";

/**
 * Unit tests for the JUnit XML parser used by `Delegate Test to Gradle`.
 *
 * Rule of thumb when touching `testResultParser.ts`: add the failing case
 * HERE first, then change the production code. Each case should name the
 * Copilot review comment / GitHub issue it corresponds to so future
 * contributors can trace intent.
 */
describe(getSuiteName("JUnit XML result parser"), () => {
    describe("passed testcases", () => {
        it("parses a simple passed testcase with time attribute", () => {
            const xml = `<?xml version="1.0"?>
<testsuite name="com.example.MyTest">
  <testcase name="testOk" classname="com.example.MyTest" time="0.05"/>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].className, "com.example.MyTest");
            assert.strictEqual(results[0].methodName, "testOk");
            assert.strictEqual(results[0].state, TestResultState.Passed);
            assert.strictEqual(results[0].duration, 50);
            assert.strictEqual(results[0].message, undefined);
        });

        it("parses multiple testcases in one suite", () => {
            const xml = `<testsuite>
  <testcase name="a" classname="C" time="0.01"/>
  <testcase name="b" classname="C" time="0.02"/>
  <testcase name="c" classname="C" time="0.03"/>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results.length, 3);
            assert.deepStrictEqual(
                results.map((r) => r.methodName),
                ["a", "b", "c"]
            );
        });
    });

    describe("failures (C1: message-attr fallback)", () => {
        it("uses the message attribute when the body is empty (self-closing <failure/>)", () => {
            const xml = `<testsuite>
  <testcase name="t" classname="C">
    <failure message="expected &lt;1&gt; but was &lt;2&gt;" type="AssertionError"/>
  </testcase>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].state, TestResultState.Failed);
            assert.strictEqual(results[0].message, "expected <1> but was <2>");
        });

        it("uses the message attribute when body is whitespace-only", () => {
            const xml = `<testsuite>
  <testcase name="t" classname="C">
    <failure message="boom">
    </failure>
  </testcase>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results[0].message, "boom");
        });

        it("combines message attribute with stacktrace body when both are present", () => {
            const xml = `<testsuite>
  <testcase name="t" classname="C">
    <failure message="expected 1 but was 2" type="AssertionError">java.lang.AssertionError: expected 1 but was 2
\tat C.t(C.java:10)</failure>
  </testcase>
</testsuite>`;
            const results = parseJUnitXml(xml);
            const msg = results[0].message ?? "";
            assert.ok(msg.startsWith("expected 1 but was 2\n"), `message should begin with attr: ${msg}`);
            assert.ok(msg.includes("C.java:10"), "message should include stacktrace body");
        });

        it("does not duplicate the message when the body already starts with it", () => {
            const xml = `<testsuite>
  <testcase name="t" classname="C">
    <failure message="boom">boom\n\tat C.t(C.java:10)</failure>
  </testcase>
</testsuite>`;
            const results = parseJUnitXml(xml);
            const msg = results[0].message ?? "";
            assert.strictEqual(msg.match(/boom/g)?.length, 1, `expected 'boom' once, got: ${msg}`);
        });

        it("still parses body-only failures (pre-existing behaviour)", () => {
            const xml = `<testsuite>
  <testcase name="t" classname="C">
    <failure>raw stacktrace only</failure>
  </testcase>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results[0].state, TestResultState.Failed);
            assert.strictEqual(results[0].message, "raw stacktrace only");
        });
    });

    describe("errors", () => {
        it("distinguishes <error> from <failure> and still honours attr fallback", () => {
            const xml = `<testsuite>
  <testcase name="t" classname="C">
    <error message="NullPointerException" type="java.lang.NullPointerException"/>
  </testcase>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results[0].state, TestResultState.Errored);
            assert.strictEqual(results[0].message, "NullPointerException");
        });
    });

    describe("skipped", () => {
        it("marks <skipped/> cases as Skipped with no message", () => {
            const xml = `<testsuite>
  <testcase name="t" classname="C">
    <skipped/>
  </testcase>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results[0].state, TestResultState.Skipped);
            assert.strictEqual(results[0].message, undefined);
        });
    });

    describe("duration parsing (C8: Number.isFinite guard)", () => {
        it("returns undefined duration when time attribute is missing", () => {
            const xml = `<testsuite><testcase name="t" classname="C"/></testsuite>`;
            assert.strictEqual(parseJUnitXml(xml)[0].duration, undefined);
        });

        it("returns undefined when time attribute is not a finite number", () => {
            const xml = `<testsuite>
  <testcase name="a" classname="C" time="NaN"/>
  <testcase name="b" classname="C" time="Infinity"/>
  <testcase name="c" classname="C" time=""/>
  <testcase name="d" classname="C" time="not-a-number"/>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results.length, 4);
            for (const r of results) {
                assert.strictEqual(r.duration, undefined, `${r.methodName} should have undefined duration`);
            }
        });

        it("rounds fractional seconds to milliseconds", () => {
            const xml = `<testsuite>
  <testcase name="a" classname="C" time="0.1234"/>
  <testcase name="b" classname="C" time="1"/>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results[0].duration, 123);
            assert.strictEqual(results[1].duration, 1000);
        });
    });

    describe("malformed / edge input", () => {
        it("returns [] for empty string", () => {
            assert.deepStrictEqual(parseJUnitXml(""), []);
        });

        it("skips testcases missing name or classname", () => {
            const xml = `<testsuite>
  <testcase classname="C" time="0.01"/>
  <testcase name="t" time="0.01"/>
  <testcase name="ok" classname="C" time="0.01"/>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].methodName, "ok");
        });

        it("decodes XML entities in attributes", () => {
            const xml = `<testsuite>
  <testcase name="t[&amp;a]" classname="com.example.C&amp;D" time="0.01"/>
</testsuite>`;
            const results = parseJUnitXml(xml);
            assert.strictEqual(results[0].methodName, "t[&a]");
            assert.strictEqual(results[0].className, "com.example.C&D");
        });
    });
});
