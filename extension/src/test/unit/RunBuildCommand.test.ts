import * as assert from "assert";
import * as path from "path";
import { getBuildDirectory, parseRunBuildArgs } from "../../commands/RunBuildCommand";

describe("parseRunBuildArgs", () => {
    it("takes the build file, the command and the environment", () => {
        const args = parseRunBuildArgs(["/project/build.gradle", "classes aotClasses", { JAVA_HOME: "/jdk" }]);
        assert.deepStrictEqual(args, {
            buildFile: "/project/build.gradle",
            command: "classes aotClasses",
            environment: { JAVA_HOME: "/jdk" },
        });
    });

    it("has nothing without arguments, as when run from the command palette", () => {
        // the registration appends an empty list of parameters
        assert.deepStrictEqual(parseRunBuildArgs([[]]), {
            buildFile: undefined,
            command: undefined,
            environment: undefined,
        });
        assert.deepStrictEqual(parseRunBuildArgs([]), {
            buildFile: undefined,
            command: undefined,
            environment: undefined,
        });
    });

    it("does not take an empty list for the environment", () => {
        const args = parseRunBuildArgs(["/project/build.gradle", "build", []]);
        assert.strictEqual(args.environment, undefined);
    });

    it("ignores blank text and an environment with other than text values", () => {
        assert.strictEqual(parseRunBuildArgs(["  ", "  "]).buildFile, undefined);
        assert.strictEqual(parseRunBuildArgs(["/p/build.gradle", "  "]).command, undefined);
        assert.strictEqual(parseRunBuildArgs(["/p/build.gradle", "build", { A: 1 }]).environment, undefined);
        assert.strictEqual(parseRunBuildArgs([{ not: "a path" }]).buildFile, undefined);
    });

    it("accepts an empty environment", () => {
        assert.deepStrictEqual(parseRunBuildArgs(["/p/build.gradle", "build", {}]).environment, {});
    });
});

describe("getBuildDirectory", () => {
    it("returns the directory of a build file and a directory as it is", () => {
        assert.strictEqual(
            getBuildDirectory(path.resolve("workspace", "sub", "build.gradle")),
            path.resolve("workspace", "sub")
        );
        assert.strictEqual(getBuildDirectory(__dirname), __dirname);
    });
});
