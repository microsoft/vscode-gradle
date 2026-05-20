/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from "assert";
import * as fse from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";

import { getSuiteName } from "../testUtil";
import {
    buildDirectArgs,
    buildDirectEnv,
    cancelDirectBuild,
    DEBUG_INIT_SCRIPT_CONTENT,
    ensureDebugInitScript,
    findGradleWrapper,
    hasDirectBuild,
    __resetDirectRegistryForTests,
} from "../../tasks/DirectTaskExecutor";

describe(getSuiteName("DirectTaskExecutor"), () => {
    afterEach(() => {
        sinon.restore();
        __resetDirectRegistryForTests();
    });

    describe("buildDirectArgs", () => {
        it("returns user args unchanged when no debug / no console policy", () => {
            const args = buildDirectArgs({
                userArgs: ["build", "--info"],
                javaDebugPort: 0,
                showOutputColors: true,
            });
            assert.deepStrictEqual(args, ["build", "--info"]);
        });

        it("injects --init-script and -Dvscode.debug.port when debugging", () => {
            const args = buildDirectArgs({
                userArgs: ["test"],
                javaDebugPort: 5005,
                initScriptPath: "/tmp/init.gradle",
                showOutputColors: true,
            });
            assert.deepStrictEqual(args, ["--init-script", "/tmp/init.gradle", "-Dvscode.debug.port=5005", "test"]);
        });

        it("uses the vscode.debug.port (not gradle.debug.port) system property name", () => {
            const args = buildDirectArgs({
                userArgs: ["build"],
                javaDebugPort: 42,
                initScriptPath: "/tmp/x.gradle",
                showOutputColors: true,
            });
            assert.ok(args.includes("-Dvscode.debug.port=42"), `expected -Dvscode.debug.port=42 in ${args.join(" ")}`);
            assert.ok(!args.some((a) => a.startsWith("-Dgradle.debug.port=")), "must not use -Dgradle.debug.port=…");
        });

        it("forces --console=plain when colors are disabled and user did not override", () => {
            const args = buildDirectArgs({
                userArgs: ["build"],
                javaDebugPort: 0,
                showOutputColors: false,
            });
            assert.ok(args.includes("--console=plain"), `expected --console=plain in ${args.join(" ")}`);
        });

        it("does NOT add --console=plain when colors are enabled", () => {
            const args = buildDirectArgs({
                userArgs: ["build"],
                javaDebugPort: 0,
                showOutputColors: true,
            });
            assert.ok(!args.some((a) => a.startsWith("--console=")), `unexpected --console in ${args.join(" ")}`);
        });

        it("respects a user-supplied --console=… and skips the auto policy", () => {
            const args = buildDirectArgs({
                userArgs: ["build", "--console=rich"],
                javaDebugPort: 0,
                showOutputColors: false,
            });
            const consoleArgs = args.filter((a) => a.startsWith("--console"));
            assert.deepStrictEqual(consoleArgs, ["--console=rich"]);
        });

        it("respects a user-supplied -Dorg.gradle.console=… and skips the auto policy", () => {
            const args = buildDirectArgs({
                userArgs: ["build", "-Dorg.gradle.console=verbose"],
                javaDebugPort: 0,
                showOutputColors: false,
            });
            assert.ok(!args.includes("--console=plain"));
        });

        it("does NOT pass --init-script when there is no debug port", () => {
            const args = buildDirectArgs({
                userArgs: ["build"],
                javaDebugPort: 0,
                initScriptPath: "/tmp/x.gradle",
                showOutputColors: true,
            });
            assert.ok(!args.includes("--init-script"));
        });

        it("places user args last so they override injected flags", () => {
            const args = buildDirectArgs({
                userArgs: ["clean", "build"],
                javaDebugPort: 5005,
                initScriptPath: "/tmp/i.gradle",
                showOutputColors: false,
            });
            assert.strictEqual(args[args.length - 2], "clean");
            assert.strictEqual(args[args.length - 1], "build");
        });
    });

    describe("buildDirectEnv", () => {
        function stubGradleConfig(values: {
            javaHome?: string | null;
            jvmArguments?: string | null;
            userHome?: string | null;
        }): void {
            const original = vscode.workspace.getConfiguration;
            sinon.stub(vscode.workspace, "getConfiguration").callsFake((section?: string, scope?: any) => {
                if (section === "java") {
                    return {
                        get<T>(key: string, defaultValue?: T): T {
                            if (key === "import.gradle.java.home") {
                                return (values.javaHome ?? null) as unknown as T;
                            }
                            if (key === "import.gradle.jvmArguments") {
                                return (values.jvmArguments ?? null) as unknown as T;
                            }
                            if (key === "import.gradle.user.home") {
                                return (values.userHome ?? null) as unknown as T;
                            }
                            return defaultValue as T;
                        },
                    } as any;
                }
                return original.call(vscode.workspace, section as any, scope);
            });
        }

        it("inherits parent env when no Gradle config is set", () => {
            stubGradleConfig({});
            const env = buildDirectEnv({ parentEnv: { PATH: "/usr/bin", FOO: "bar" } });
            assert.strictEqual(env.FOO, "bar");
            assert.strictEqual(env.JAVA_HOME, undefined);
            assert.strictEqual(env.GRADLE_OPTS, undefined);
            assert.strictEqual(env.JAVA_TOOL_OPTIONS, undefined);
        });

        it("sets JAVA_HOME and prepends <home>/bin to PATH when java.import.gradle.java.home is set", () => {
            const fakeJavaHome = process.platform === "win32" ? "C:\\jdk17" : "/opt/jdk17";
            stubGradleConfig({ javaHome: fakeJavaHome });
            const env = buildDirectEnv({ parentEnv: { PATH: "/usr/bin" } });
            assert.strictEqual(env.JAVA_HOME, fakeJavaHome);
            const expectedBin = path.join(fakeJavaHome, "bin");
            assert.ok(env.PATH && env.PATH.startsWith(expectedBin), `PATH=${env.PATH}`);
            assert.ok(env.PATH!.includes("/usr/bin"));
        });

        it("appends java.import.gradle.jvmArguments to GRADLE_OPTS", () => {
            stubGradleConfig({ jvmArguments: "-Xmx4g -XX:+UseG1GC" });
            const env = buildDirectEnv({ parentEnv: { GRADLE_OPTS: "-Xms512m" } });
            assert.ok(env.GRADLE_OPTS!.includes("-Xms512m"));
            assert.ok(env.GRADLE_OPTS!.includes("-Xmx4g"));
            assert.ok(env.GRADLE_OPTS!.includes("-XX:+UseG1GC"));
        });

        it("ignores empty jvmArguments string", () => {
            stubGradleConfig({ jvmArguments: "   " });
            const env = buildDirectEnv({ parentEnv: {} });
            assert.strictEqual(env.GRADLE_OPTS, undefined);
        });

        it("propagates additionalToolOptions as JAVA_TOOL_OPTIONS", () => {
            stubGradleConfig({});
            const env = buildDirectEnv({
                parentEnv: {},
                additionalToolOptions: "-Dfoo=bar -Dbaz=qux",
            });
            assert.strictEqual(env.JAVA_TOOL_OPTIONS, "-Dfoo=bar -Dbaz=qux");
        });

        it("appends additionalToolOptions to any inherited JAVA_TOOL_OPTIONS", () => {
            stubGradleConfig({});
            const env = buildDirectEnv({
                parentEnv: { JAVA_TOOL_OPTIONS: "-Dexisting=1" },
                additionalToolOptions: "-Dadded=2",
            });
            assert.ok(env.JAVA_TOOL_OPTIONS!.includes("-Dexisting=1"));
            assert.ok(env.JAVA_TOOL_OPTIONS!.includes("-Dadded=2"));
        });

        it("sets GRADLE_USER_HOME when java.import.gradle.user.home is set", () => {
            stubGradleConfig({ userHome: "/custom/gradle/home" });
            const env = buildDirectEnv({ parentEnv: {} });
            assert.strictEqual(env.GRADLE_USER_HOME, "/custom/gradle/home");
        });
    });

    describe("findGradleWrapper", () => {
        let tmpRoot: string;

        beforeEach(async () => {
            tmpRoot = await fse.mkdtemp(path.join(os.tmpdir(), "vscode-gradle-direct-test-"));
        });

        afterEach(async () => {
            await fse.remove(tmpRoot).catch(() => undefined);
        });

        it("returns undefined when gradle-wrapper.properties is missing", async () => {
            const result = await findGradleWrapper(tmpRoot);
            assert.strictEqual(result, undefined);
        });

        it("returns undefined when the wrapper script is missing", async () => {
            await fse.outputFile(path.join(tmpRoot, "gradle", "wrapper", "gradle-wrapper.properties"), "");
            const result = await findGradleWrapper(tmpRoot);
            assert.strictEqual(result, undefined);
        });

        it("returns the wrapper script path when both files exist", async () => {
            await fse.outputFile(path.join(tmpRoot, "gradle", "wrapper", "gradle-wrapper.properties"), "");
            const wrapperName = process.platform === "win32" ? "gradlew.bat" : "gradlew";
            const wrapperPath = path.join(tmpRoot, wrapperName);
            await fse.outputFile(wrapperPath, "");
            if (process.platform !== "win32") {
                await fse.chmod(wrapperPath, 0o755);
            }
            const result = await findGradleWrapper(tmpRoot);
            assert.strictEqual(result, wrapperPath);
        });

        it("returns undefined on Unix when the wrapper script is not executable", async function () {
            if (process.platform === "win32") {
                this.skip();
                return;
            }
            await fse.outputFile(path.join(tmpRoot, "gradle", "wrapper", "gradle-wrapper.properties"), "");
            const wrapperPath = path.join(tmpRoot, "gradlew");
            await fse.outputFile(wrapperPath, "");
            await fse.chmod(wrapperPath, 0o644);
            const result = await findGradleWrapper(tmpRoot);
            assert.strictEqual(result, undefined);
        });
    });

    describe("ensureDebugInitScript", () => {
        let tmpRoot: string;

        beforeEach(async () => {
            tmpRoot = await fse.mkdtemp(path.join(os.tmpdir(), "vscode-gradle-init-test-"));
        });

        afterEach(async () => {
            await fse.remove(tmpRoot).catch(() => undefined);
        });

        it("writes the script with the documented Java-side content", async () => {
            const p = await ensureDebugInitScript(tmpRoot);
            const written = await fse.readFile(p, "utf8");
            assert.strictEqual(written, DEBUG_INIT_SCRIPT_CONTENT);
        });

        it("uses a content-addressed filename so the file is stable", async () => {
            const a = await ensureDebugInitScript(tmpRoot);
            const b = await ensureDebugInitScript(tmpRoot);
            assert.strictEqual(a, b);
            assert.ok(path.basename(a).startsWith("vscode-gradle-debug-init-"));
            assert.ok(path.basename(a).endsWith(".gradle"));
        });

        it("uses 'vscode.debug.port' (not 'gradle.debug.port') as the property name", () => {
            assert.ok(
                DEBUG_INIT_SCRIPT_CONTENT.includes("System.getProperty('vscode.debug.port')"),
                "init script must read the vscode.debug.port system property"
            );
            assert.ok(!DEBUG_INIT_SCRIPT_CONTENT.includes("gradle.debug.port"));
        });

        it("survives concurrent invocations without leaking partial files", async () => {
            const results = await Promise.all(Array.from({ length: 8 }, () => ensureDebugInitScript(tmpRoot)));
            // All should resolve to the same target path.
            assert.strictEqual(new Set(results).size, 1);
            // No leftover .tmp files.
            const entries = await fse.readdir(tmpRoot);
            const tmpLeftovers = entries.filter((e) => e.endsWith(".tmp"));
            assert.deepStrictEqual(tmpLeftovers, []);
        });
    });

    describe("registry / cancelDirectBuild", () => {
        it("returns false when no direct build is registered for the key", () => {
            assert.strictEqual(cancelDirectBuild("does-not-exist"), false);
            assert.strictEqual(hasDirectBuild("does-not-exist"), false);
        });
    });
});
