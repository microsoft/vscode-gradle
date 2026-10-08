import * as assert from "assert";
import * as path from "path";
import * as fs from "fs-extra";
import { execFile } from "child_process";
import { promisify } from "util";
import { downloadAndUnzipVSCode, runTests, runVSCodeCommand } from "@vscode/test-electron";

const extensionDevelopmentPath = path.resolve(__dirname, "../..");
const exec = promisify(execFile);

async function javaHome(version: string): Promise<string> {
    const home = process.env[`JDK${version}_HOME`];
    assert.ok(home, `Set JDK${version}_HOME to a JDK ${version} installation`);
    const release = await fs.readFile(path.join(home, "release"), "utf8");
    assert.match(release, new RegExp(`^JAVA_VERSION="${version}(?:[.+-]|")`, "m"));
    return path.resolve(home);
}

async function stopDaemons(userHome: string, serviceHome: string): Promise<void> {
    const distributions = path.join(userHome, "wrapper", "dists", "gradle-9.8.1-bin");
    if (!(await fs.pathExists(distributions))) {
        return;
    }
    for (const entry of await fs.readdir(distributions)) {
        const launcher = path.join(distributions, entry, "gradle-9.8.1", "lib", "gradle-gradle-cli-main-9.8.1.jar");
        if (await fs.pathExists(launcher)) {
            const result = await exec(
                path.join(serviceHome, "bin", process.platform === "win32" ? "java.exe" : "java"),
                ["-cp", launcher, "org.gradle.launcher.GradleMain", "--gradle-user-home", userHome, "--stop"],
                { timeout: 60000 }
            );
            console.log(result.stdout);
            return;
        }
    }
    throw new Error(`Cannot locate the Gradle 9.8.1 launcher in ${distributions}`);
}

async function main(): Promise<void> {
    const jdk25 = await javaHome("25");
    const jdk27 = await javaHome("27");
    const selected = process.env.GRADLE_COMPATIBILITY_DAEMON;
    assert.ok(!selected || selected === "25" || selected === "27", "Expected daemon version 25 or 27");
    const versions = selected ? [selected] : ["27", "25"];
    // Do not let an unrelated system installation mask the fallback scenario.
    delete process.env.GRADLE_HOME;
    const vscodeExecutablePath = await downloadAndUnzipVSCode("stable");
    const tempDir = await fs.mkdtemp(path.join(extensionDevelopmentPath, ".vscode-test", "java27-"));
    console.log(`Java 27 compatibility workspace: ${tempDir}`);
    const extensionsDir = path.join(tempDir, "extensions");
    const javaVsix = path.join(tempDir, "java.vsix");
    const response = await fetch(
        "https://github.com/redhat-developer/vscode-java/releases/download/v1.56.0/vscode-java-1.56.0-1066.vsix",
        { signal: AbortSignal.timeout(180000) }
    );
    if (!response.ok) {
        throw new Error(`Java extension download failed: ${response.status} ${response.statusText}`);
    }
    await fs.writeFile(javaVsix, Buffer.from(await response.arrayBuffer()));
    for (const extension of [javaVsix, "vscjava.vscode-java-debug@0.59.0"]) {
        const result = await runVSCodeCommand([
            "--install-extension",
            extension,
            "--extensions-dir",
            extensionsDir,
            "--user-data-dir",
            path.join(tempDir, "install-user"),
            "--force",
        ]);
        console.log(result.stdout);
    }

    for (const version of versions) {
        const scenarioDir = path.join(tempDir, `daemon-${version}`);
        const fixture = path.join(scenarioDir, "gradle-java27");
        const userDir = path.join(scenarioDir, "user");
        const gradleHome = path.join(scenarioDir, "gradle-home");
        const daemonHome = version === "27" ? jdk27 : jdk25;
        await fs.copy(path.join(extensionDevelopmentPath, "test-fixtures", "gradle-java27"), fixture);
        await fs.writeFile(
            path.join(fixture, "gradle.properties"),
            [
                `org.gradle.java.installations.paths=${[jdk25, jdk27]
                    .map((home) => home.replace(/\\/g, "\\\\"))
                    .join(",")}`,
                "org.gradle.java.installations.auto-detect=false",
                "org.gradle.java.installations.auto-download=false",
                "org.gradle.daemon.idletimeout=10000",
                "",
            ].join("\n")
        );
        await fs.outputJson(path.join(userDir, "User", "settings.json"), {
            "java.jdt.ls.java.home": jdk25,
            "java.import.gradle.java.home": daemonHome,
            "java.import.gradle.user.home": gradleHome,
            "java.import.gradle.wrapper.enabled": version === "25",
            "java.configuration.runtimes": [{ name: "JavaSE-27", path: jdk27, default: true }],
            "java.configuration.updateBuildConfiguration": "automatic",
            "java.import.generatesMetadataFilesAtProjectRoot": true,
            "java.server.launchMode": "Standard",
            "java.autobuild.enabled": false,
            "java.gradle.buildServer.enabled": "on",
            "security.workspace.trust.enabled": false,
            "extensions.autoUpdate": false,
            "telemetry.telemetryLevel": "off",
            "chat.disableAIFeatures": true,
        });
        try {
            await runTests({
                vscodeExecutablePath,
                extensionDevelopmentPath,
                extensionTestsPath: path.join(__dirname, "integration", "compatibility"),
                launchArgs: [
                    fixture,
                    "--disable-gpu",
                    "--skip-welcome",
                    "--skip-release-notes",
                    `--user-data-dir=${userDir}`,
                    `--extensions-dir=${extensionsDir}`,
                ],
                extensionTestsEnv: {
                    JAVA_HOME: jdk25,
                    JDK27_HOME: jdk27,
                    COMPATIBILITY_DAEMON_HOME: daemonHome,
                    COMPATIBILITY_DAEMON_VERSION: version,
                    FIXTURE_NAME: "gradle-java27",
                    SUITE_NAME: `Gradle 9.8.1 / daemon ${version} / toolchain 27`,
                    VSCODE_TEST: "true",
                },
            });
        } finally {
            await stopDaemons(gradleHome, jdk25);
        }
    }
    await fs.remove(tempDir);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
