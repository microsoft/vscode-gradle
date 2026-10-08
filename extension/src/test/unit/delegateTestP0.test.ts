import * as assert from "assert";
import { getCoverageInitScriptLines, supportsDelegatedTestCoverage } from "../../bs/coverage";
import { getSuiteName } from "../testUtil";

/**
 * Unit tests for the P0 "Delegate Test to Gradle" coverage init script
 * (vscode-gradle#1890). Coverage is exec-only: the init script attaches the
 * JaCoCo agent so each Test JVM writes `.exec` data; JDTLS performs the
 * analysis. No report task runs and no XML is parsed on the client.
 */
describe(getSuiteName("Delegate test P0 helpers"), () => {
    describe("getCoverageInitScriptLines", () => {
        it("writes execution data under the provided output directory", () => {
            const script = getCoverageInitScriptLines("C:\\temp\\coverage\\execution-data").join("\n");

            assert.match(script, /coverageExecDir = new File\('C:\\\\temp\\\\coverage\\\\execution-data'/);
            assert.match(script, /destinationFile = new File\(coverageExecDir/);
        });

        it("isolates execution data per project and per Test task", () => {
            const script = getCoverageInitScriptLines("C:\\temp\\coverage").join("\n");

            assert.match(script, /def coverageProjectId = p\.path\.replaceAll/);
            assert.match(script, /def execName = t\.name\.replaceAll/);
            assert.match(script, /new File\(coverageExecDir, 'jacoco' \+ execName \+ '\.exec'\)/);
        });

        it("applies the jacoco plugin only when absent and runs no report task", () => {
            const script = getCoverageInitScriptLines("C:\\temp\\coverage").join("\n");

            assert.match(script, /if \(!p\.plugins\.hasPlugin\('jacoco'\)\)/);
            assert.doesNotMatch(script, /jacocoTestReport/);
            assert.doesNotMatch(script, /finalizedBy/);
            assert.doesNotMatch(script, /outputLocation/);
            assert.doesNotMatch(script, /xml\.required/);
        });

        it("escapes single quotes in the output directory path", () => {
            const script = getCoverageInitScriptLines("/tmp/wei's cov").join("\n");

            assert.match(script, /new File\('\/tmp\/wei\\'s cov'/);
        });
    });

    describe("supportsDelegatedTestCoverage", () => {
        it("reports support when the host advertises the capability", () => {
            assert.strictEqual(supportsDelegatedTestCoverage({ capabilities: ["delegatedTestCoverage"] }), true);
        });

        it("reports no support for hosts released before capability declaration", () => {
            assert.strictEqual(supportsDelegatedTestCoverage({}), false);
        });

        it("reports no support when the capability is absent from the list", () => {
            assert.strictEqual(supportsDelegatedTestCoverage({ capabilities: ["someOtherCapability"] }), false);
        });

        it("reports no support when the extension API is unavailable", () => {
            assert.strictEqual(supportsDelegatedTestCoverage(undefined), false);
        });
    });
});
