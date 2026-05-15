import * as cp from "child_process";
import * as crypto from "crypto";
import * as fse from "fs-extra";
import * as os from "os";
import * as path from "path";
import { StringDecoder } from "string_decoder";
import * as vscode from "vscode";

import { logger } from "../logger";
import { RootProject } from "../rootProject/RootProject";
import {
    getConfigJavaImportGradleJavaHome,
    getConfigJavaImportGradleJvmArguments,
    getConfigJavaImportGradleUserHome,
} from "../util/config";

/**
 * Phase 1 implementation of the "direct" task execution backend.
 *
 * Instead of sending a RunBuild gRPC request to the embedded Gradle server,
 * we spawn the project's own `gradlew` script as a child process. This
 * sidesteps enterprise EDR/DPI software that intercepts loopback HTTP/2
 * traffic and injects `RST_STREAM` mid-frame (issue #1815, #1825).
 *
 * See `docs/local-task-execution.md` for the full design.
 */

// =============================================================================
// Concurrency
// =============================================================================

const MAX_CONCURRENCY = Math.max(2, Math.min(4, Math.floor(os.cpus().length / 2)));

class Semaphore {
    private waiters: Array<() => void> = [];
    private inFlight = 0;

    constructor(private readonly capacity: number) {}

    public async acquire(onQueued?: () => void): Promise<() => void> {
        if (this.inFlight < this.capacity) {
            this.inFlight++;
            return () => this.release();
        }
        if (onQueued) {
            try {
                onQueued();
            } catch {
                /* ignore */
            }
        }
        await new Promise<void>((resolve) => this.waiters.push(resolve));
        this.inFlight++;
        return () => this.release();
    }

    private release(): void {
        this.inFlight--;
        const next = this.waiters.shift();
        if (next) {
            next();
        }
    }
}

const semaphore = new Semaphore(MAX_CONCURRENCY);

// =============================================================================
// In-flight handle registry, keyed by cancellationKey
// =============================================================================

interface DirectHandle {
    child: cp.ChildProcess;
    cancellationKey: string;
    task?: vscode.Task;
    exited: boolean;
    cancelled: boolean;
    cancel: () => void;
}

const directRegistry: Map<string, DirectHandle> = new Map();

/**
 * Returns true and cancels the in-flight direct build matching
 * `cancellationKey`. Returns false if no direct build is registered for
 * that key (the caller should then fall through to the gRPC cancel path).
 */
export function cancelDirectBuild(cancellationKey: string): boolean {
    const handle = directRegistry.get(cancellationKey);
    if (!handle) {
        return false;
    }
    handle.cancel();
    return true;
}

/**
 * Returns true if a direct build is currently registered for the given
 * cancellation key. Useful for callers that need to know which backend
 * is in flight without sending a cancel.
 */
export function hasDirectBuild(cancellationKey: string): boolean {
    return directRegistry.has(cancellationKey);
}

// =============================================================================
// Wrapper discovery
// =============================================================================

const WRAPPER_PROPERTIES = path.join("gradle", "wrapper", "gradle-wrapper.properties");

/**
 * Returns the absolute path of the wrapper script for `rootProjectDir`,
 * or `undefined` if no usable wrapper is present.
 */
export async function findGradleWrapper(rootProjectDir: string): Promise<string | undefined> {
    const propertiesPath = path.join(rootProjectDir, WRAPPER_PROPERTIES);
    if (!(await fse.pathExists(propertiesPath))) {
        return undefined;
    }
    const wrapperName = process.platform === "win32" ? "gradlew.bat" : "gradlew";
    const wrapperPath = path.join(rootProjectDir, wrapperName);
    if (!(await fse.pathExists(wrapperPath))) {
        return undefined;
    }
    return wrapperPath;
}

// =============================================================================
// Java debug init script
// =============================================================================

/**
 * Same content as `GradleBuildRunner.DEBUG_INIT_SCRIPT_CONTENT` in the
 * Java server. The script reads the debug port from the
 * `vscode.debug.port` system property, set via `-D` on the command line,
 * which lets Gradle's configuration cache be reused across debug sessions
 * with different ports.
 */
export const DEBUG_INIT_SCRIPT_CONTENT =
    "allprojects {\n" +
    "    tasks.withType(JavaExec) {\n" +
    "        outputs.upToDateWhen { false }\n" +
    "        doFirst {\n" +
    "            def port = System.getProperty('vscode.debug.port')\n" +
    "            if (port) {\n" +
    '                jvmArgs "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=localhost:${port}"\n' +
    "            }\n" +
    "        }\n" +
    "    }\n" +
    "    tasks.withType(Test) {\n" +
    "        outputs.upToDateWhen { false }\n" +
    "        doFirst {\n" +
    "            def port = System.getProperty('vscode.debug.port')\n" +
    "            if (port) {\n" +
    '                jvmArgs "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=localhost:${port}"\n' +
    "            }\n" +
    "        }\n" +
    "    }\n" +
    "}";

const DEBUG_PORT_PROPERTY = "vscode.debug.port";

/**
 * Writes the init script to a content-addressed file in the OS temp
 * directory and returns the path. The write is atomic (write-temp + rename)
 * to avoid partial-file races between concurrent debug runs.
 */
export async function ensureDebugInitScript(tmpdir: string = os.tmpdir()): Promise<string> {
    const hash = crypto.createHash("sha256").update(DEBUG_INIT_SCRIPT_CONTENT).digest("hex").slice(0, 16);
    const targetPath = path.join(tmpdir, `vscode-gradle-debug-init-${hash}.gradle`);
    if (await fse.pathExists(targetPath)) {
        return targetPath;
    }
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    await fse.writeFile(tmpPath, DEBUG_INIT_SCRIPT_CONTENT, "utf8");
    try {
        await fse.rename(tmpPath, targetPath);
    } catch (err) {
        // Another process won the race; clean up our temp file.
        await fse.remove(tmpPath).catch(() => undefined);
        if (!(await fse.pathExists(targetPath))) {
            throw err;
        }
    }
    return targetPath;
}

// =============================================================================
// Argument / environment construction
// =============================================================================

export interface DirectArgsOptions {
    userArgs: ReadonlyArray<string>;
    javaDebugPort: number;
    initScriptPath?: string;
    showOutputColors: boolean;
}

/**
 * Builds the command-line arguments to pass to the wrapper.
 *
 * Order:
 *   1. `--init-script <path>` if a debug init script was provided
 *   2. `-Dvscode.debug.port=<port>` if `javaDebugPort > 0`
 *   3. `--console=plain` if `showOutputColors === false` and the user did
 *      not already specify `--console=…` / `-Dorg.gradle.console=…`
 *   4. The user-supplied args last so they can override any of the above.
 *
 * Mirrors `GradleBuildRunner.buildArguments()` in the Java server, except
 * for the color / console policy which Tooling API normally controls via
 * `setColorOutput()`.
 */
export function buildDirectArgs(opts: DirectArgsOptions): string[] {
    const args: string[] = [];
    if (opts.javaDebugPort > 0 && opts.initScriptPath) {
        args.push("--init-script", opts.initScriptPath);
    }
    if (opts.javaDebugPort > 0) {
        args.push(`-D${DEBUG_PORT_PROPERTY}=${opts.javaDebugPort}`);
    }
    if (!opts.showOutputColors && !userOverridesConsole(opts.userArgs)) {
        args.push("--console=plain");
    }
    args.push(...opts.userArgs);
    return args;
}

function userOverridesConsole(userArgs: ReadonlyArray<string>): boolean {
    return userArgs.some(
        (a) => a === "--console" || a.startsWith("--console=") || a.startsWith("-Dorg.gradle.console=")
    );
}

export interface DirectEnvOptions {
    additionalToolOptions?: string;
    parentEnv?: NodeJS.ProcessEnv;
}

/**
 * Builds the environment for the child process.
 *
 * - `JAVA_HOME` and a `PATH` prefix come from `java.import.gradle.java.home`.
 *   If unset, the parent env is inherited.
 * - `GRADLE_OPTS` carries `java.import.gradle.jvmArguments` (appended to any
 *   inherited value).
 * - `GRADLE_USER_HOME` carries `java.import.gradle.user.home` if set.
 * - `JAVA_TOOL_OPTIONS` carries `additionalToolOptions` (appended to any
 *   inherited value), matching `GradleBuildRunner.buildJavaEnvVarsWithToolOptions`.
 */
export function buildDirectEnv(opts: DirectEnvOptions = {}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...(opts.parentEnv ?? process.env) };

    const javaHome = getConfigJavaImportGradleJavaHome();
    if (javaHome) {
        env.JAVA_HOME = javaHome;
        const javaBin = path.join(javaHome, "bin");
        const sep = process.platform === "win32" ? ";" : ":";
        env.PATH = env.PATH ? `${javaBin}${sep}${env.PATH}` : javaBin;
    }

    const jvmArguments = getConfigJavaImportGradleJvmArguments();
    if (jvmArguments && jvmArguments.trim()) {
        env.GRADLE_OPTS = env.GRADLE_OPTS ? `${env.GRADLE_OPTS} ${jvmArguments}` : jvmArguments;
    }

    const gradleUserHome = getConfigJavaImportGradleUserHome();
    if (gradleUserHome) {
        env.GRADLE_USER_HOME = gradleUserHome;
    }

    if (opts.additionalToolOptions && opts.additionalToolOptions.trim()) {
        env.JAVA_TOOL_OPTIONS = env.JAVA_TOOL_OPTIONS
            ? `${env.JAVA_TOOL_OPTIONS} ${opts.additionalToolOptions}`
            : opts.additionalToolOptions;
    }

    return env;
}

// =============================================================================
// Top-level execution
// =============================================================================

export interface RunDirectBuildOptions {
    rootProject: RootProject;
    cancellationKey: string;
    args: ReadonlyArray<string>;
    javaDebugPort: number;
    additionalToolOptions: string;
    showOutputColors: boolean;
    task?: vscode.Task;
    /** Receives decoded stdout / stderr chunks. */
    onOutput: (text: string) => void;
    /** Optional notice emitted when the run is queued behind the semaphore. */
    onQueued?: () => void;
}

export class DirectBuildError extends Error {
    constructor(
        message: string,
        public readonly exitCode: number | null,
        public readonly signal: NodeJS.Signals | null
    ) {
        super(message);
        this.name = "DirectBuildError";
    }
}

export class DirectBuildCancelledError extends Error {
    constructor() {
        super("Build cancelled");
        this.name = "DirectBuildCancelledError";
    }
}

/**
 * Runs a Gradle build by spawning the project's wrapper as a child process.
 *
 * Rejects with:
 *  - `DirectBuildCancelledError` if the build was cancelled.
 *  - `DirectBuildError` if the build exited non-zero.
 *  - Any spawn-time error otherwise (caller falls back to gRPC).
 */
export async function runDirectBuild(opts: RunDirectBuildOptions): Promise<void> {
    const rootProjectDir = opts.rootProject.getProjectUri().fsPath;
    const wrapperPath = await findGradleWrapper(rootProjectDir);
    if (!wrapperPath) {
        throw new Error(`No Gradle wrapper found at ${rootProjectDir}`);
    }

    let initScriptPath: string | undefined;
    if (opts.javaDebugPort > 0) {
        initScriptPath = await ensureDebugInitScript();
    }

    const childArgs = buildDirectArgs({
        userArgs: opts.args,
        javaDebugPort: opts.javaDebugPort,
        initScriptPath,
        showOutputColors: opts.showOutputColors,
    });
    const env = buildDirectEnv({ additionalToolOptions: opts.additionalToolOptions });

    const release = await semaphore.acquire(opts.onQueued);
    try {
        await spawnAndAwait({
            cancellationKey: opts.cancellationKey,
            task: opts.task,
            wrapperPath,
            args: childArgs,
            cwd: rootProjectDir,
            env,
            onOutput: opts.onOutput,
        });
    } finally {
        release();
    }
}

interface SpawnAndAwaitOptions {
    cancellationKey: string;
    task?: vscode.Task;
    wrapperPath: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    onOutput: (text: string) => void;
}

function spawnAndAwait(opts: SpawnAndAwaitOptions): Promise<void> {
    return new Promise((resolve, reject) => {
        const isWindows = process.platform === "win32";

        // On Windows we go through `cmd.exe /c gradlew.bat ...` so that
        // (a) Node doesn't try to invoke a .bat file directly (which has
        //     known argument-escaping issues), and
        // (b) we have a clean parent process to forward signals to.
        const command = isWindows ? process.env.ComSpec || "cmd.exe" : opts.wrapperPath;
        const spawnArgs = isWindows ? ["/d", "/s", "/c", `"${opts.wrapperPath}"`, ...opts.args] : opts.args;

        const child = cp.spawn(command, spawnArgs, {
            cwd: opts.cwd,
            env: opts.env,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
            windowsVerbatimArguments: isWindows,
        });

        const handle: DirectHandle = {
            child,
            cancellationKey: opts.cancellationKey,
            task: opts.task,
            exited: false,
            cancelled: false,
            cancel: () => cancelChild(handle),
        };
        directRegistry.set(opts.cancellationKey, handle);

        const stdoutDecoder = new StringDecoder("utf8");
        const stderrDecoder = new StringDecoder("utf8");

        child.stdout?.on("data", (chunk: Buffer) => {
            opts.onOutput(stdoutDecoder.write(chunk));
        });
        child.stderr?.on("data", (chunk: Buffer) => {
            opts.onOutput(stderrDecoder.write(chunk));
        });

        child.on("error", (err) => {
            if (handle.exited) {
                return;
            }
            handle.exited = true;
            directRegistry.delete(opts.cancellationKey);
            logger.error(`[direct] spawn error for "${opts.args.join(" ")}": ${err.message}`);
            reject(err);
        });

        child.on("close", (code, signal) => {
            if (handle.exited) {
                return;
            }
            handle.exited = true;
            directRegistry.delete(opts.cancellationKey);

            // Flush any buffered partial UTF-8 sequences.
            const stdoutTail = stdoutDecoder.end();
            const stderrTail = stderrDecoder.end();
            if (stdoutTail) opts.onOutput(stdoutTail);
            if (stderrTail) opts.onOutput(stderrTail);

            if (handle.cancelled) {
                logger.info(`[direct] cancelled (exit=${code}, signal=${signal ?? ""})`);
                reject(new DirectBuildCancelledError());
                return;
            }
            if (code === 0) {
                logger.info(`[direct] completed build: ${opts.args.join(" ")}`);
                resolve();
                return;
            }
            const msg = `Gradle build failed: exit code ${code ?? "<none>"}${signal ? `, signal ${signal}` : ""}`;
            logger.error(`[direct] ${msg}`);
            reject(new DirectBuildError(msg, code, signal));
        });
    });
}

const CANCEL_GRACE_MS = 3000;

function cancelChild(handle: DirectHandle): void {
    if (handle.exited || handle.cancelled) {
        return;
    }
    handle.cancelled = true;
    const pid = handle.child.pid;
    if (typeof pid !== "number") {
        return;
    }
    logger.info(`[direct] cancelling pid=${pid} key=${handle.cancellationKey}`);
    try {
        if (process.platform === "win32") {
            // Best-effort soft cancel. SIGBREAK only delivers if the child
            // is in its own console group, which is not guaranteed for
            // non-detached spawns. The taskkill escalation below is the
            // real guarantee.
            try {
                handle.child.kill("SIGBREAK");
            } catch {
                /* ignore */
            }
        } else {
            handle.child.kill("SIGINT");
        }
    } catch (err) {
        logger.warn(`[direct] kill failed for pid=${pid}: ${(err as Error).message}`);
    }
    setTimeout(() => {
        if (handle.exited) {
            return;
        }
        logger.warn(`[direct] escalating cancel for pid=${pid} (still alive after ${CANCEL_GRACE_MS}ms)`);
        try {
            if (process.platform === "win32") {
                cp.spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true });
            } else {
                handle.child.kill("SIGKILL");
            }
        } catch (err) {
            logger.error(`[direct] escalated kill failed for pid=${pid}: ${(err as Error).message}`);
        }
    }, CANCEL_GRACE_MS);
}

// =============================================================================
// Test-only hooks
// =============================================================================

/** Visible for tests. Clears the in-flight registry without sending signals. */
export function __resetDirectRegistryForTests(): void {
    directRegistry.clear();
}
