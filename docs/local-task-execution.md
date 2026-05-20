# Local (Direct) Task Execution

> **Status**: Phase 1 implementation in progress.
> **Tracking issues**: [#1815](https://github.com/microsoft/vscode-gradle/issues/1815), [#1825](https://github.com/microsoft/vscode-gradle/issues/1825)

## 1. Background

The extension talks to a long-running Java process (`gradle-server`) over
**gRPC on a loopback TCP port** for all task-related operations. The task
server exposes five RPCs:

| RPC              | Type             | When it is called                                |
| ---------------- | ---------------- | ------------------------------------------------ |
| `GetBuild`       | server-streaming | Loading the task tree (per project, per refresh) |
| `RunBuild`       | server-streaming | Every time the user runs a task                  |
| `CancelBuild`    | unary            | User cancels a running task                      |
| `CancelBuilds`   | unary            | Extension disposes                               |
| `executeCommand` | unary            | New-project wizard normalises a package name     |

Starting roughly with the 2023–2025 release wave of endpoint protection
products (Microsoft Defender for Endpoint with Network Protection,
CrowdStrike Falcon Insight, Cisco Secure Endpoint, Trellix, Symantec, several
SASE/ZTNA agents), enterprise endpoints have begun **inspecting loopback
HTTP/2 traffic** through WFP / minifilter / DPI hooks. The gRPC channel that
this extension uses is now a regular target for those hooks. The symptom is
always the same:

```
WARNING: Exception processing message
io.grpc.StatusRuntimeException: INTERNAL: Encountered end-of-stream mid-frame
…
[error] Error running build: <task>: Call cancelled
```

The server sees the inbound HTTP/2 DATA frame truncated mid-body and reports
`end-of-stream mid-frame`; the client sees the call return `CANCELLED` within
tens of milliseconds, with `bytesIn=0`, even though:

- the gradle-server JVM is alive,
- the gRPC channel state is `READY`,
- no extension-side cancellation path was triggered (verified via the
  diagnostic instrumentation on the `diag/issue-1815-call-cancelled` branch),
- the same gRPC channel had just successfully streamed a multi-minute
  `GetBuild` response.

The only thing that fits is an external agent (typically an EDR/DPI hook
on 127.0.0.0/8 HTTP/2) injecting a `RST_STREAM` mid-frame.

## 2. Why "just migrate to JSON-RPC over named pipe" is not enough

Issue [#1825](https://github.com/microsoft/vscode-gradle/issues/1825)
proposes migrating from gRPC-over-TCP to JSON-RPC over named pipes / stdio
(LSP4J), to align with the other Java-backed components in this repository
(`gradle-language-server`, `build-server-for-gradle`,
`com.microsoft.gradle.bs.importer`). That migration is the long-term goal,
but it has several issues for the immediate problem:

1. **High engineering cost** — five RPCs, two large message types
   (`GradleBuild`, `RunBuildReply`), streaming semantics, generated stubs,
   error model. A full migration is a multi-week change with high risk for
   the millions of existing installations.

2. **Not mechanism-immune** — named-pipe traffic is empirically safe today
   (sibling repos receive zero EDR reports), but a small number of EDR
   products have begun adding pipe DPI capabilities. We do not want to bet
   the only remediation on "named pipe is safer than TCP".

3. **Auto-retry is fragile** — auto-retrying a failed `RunBuild` works
   roughly 80 % of the time today, but enterprise admins can configure their
   EDR to rate-limit local IPC, at which point retries are throttled.

We need a remediation that is **mechanism-immune to network DPI**, has
**bounded engineering cost**, and **preserves the existing code path for
unaffected users**.

## 3. Proposal: local task execution via `cp.spawn`

The vast majority of EDR / DPI products do not (and structurally cannot)
inspect anonymous parent-child stdio pipes. Every CLI program on the
operating system uses that mechanism, so endpoint products treat it as
trusted. Running `gradlew <task>` from a terminal works in every reported
case where the gRPC channel is broken — including the cases that motivated
issue #1815.

We add a second execution backend for the `RunBuild` operation: instead of
sending a gRPC request to `gradle-server`, the extension **spawns the
project's Gradle wrapper as a child process** and streams its stdio directly
into the existing pseudo-terminal. The new backend lives behind a setting
that defaults to the existing behaviour, so the change is opt-in for the
first release.

### 3.1 Surface area

| Aspect                  | gRPC backend (current)                                | Direct backend (new)                                                                                              |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Transport               | gRPC over loopback TCP (HTTP/2)                       | Parent-child stdio (anonymous pipes)                                                                              |
| Long-lived state        | `gradle-server` JVM, cached Tooling API connection    | None — process per task                                                                                           |
| Process per task        | None (one shared JVM)                                 | One short-lived `gradlew` client JVM                                                                              |
| stdout / stderr         | Chunked `Output` proto messages                       | Raw bytes from `ChildProcess`                                                                                     |
| Progress events         | Typed `Progress` proto (PROJECT_CONFIGURATION/TASK/…) | `--console=rich` text on stdout                                                                                   |
| Cancellation            | `cancelBuild` RPC → Tooling API `CancellationToken`   | `CTRL_BREAK_EVENT` (Windows) / `SIGINT` (Unix) → `taskkill /T /F` fallback after grace                            |
| stdin                   | `Test.executeBatch` / API-supplied bytes              | Closed immediately (terminal flows never use stdin)                                                               |
| Console mode            | `setColorOutput(showOutputColors)` (Tooling API)      | `--console=plain` when `showOutputColors=false`, default otherwise; never overrides a user-supplied `--console=…` |
| Java debug              | Init script written server-side                       | Init script written client-side (same content)                                                                    |
| Java debug attach       | `waitOnTcp` in extension                              | `waitOnTcp` in extension — unchanged                                                                              |
| `additionalToolOptions` | `JAVA_TOOL_OPTIONS` env (Tooling API)                 | `JAVA_TOOL_OPTIONS` env on child process                                                                          |
| `gradle.javaHome`       | Tooling API `setJavaHome` / `setJvmArguments`         | `JAVA_HOME` env + `org.gradle.java.home`/`-D` arguments                                                           |

### 3.2 Decision rules

Only `RunBuild` invocations that originate from
[`GradleRunnerTerminal`](../extension/src/terminal/GradleRunnerTerminal.ts)
are replaced in Phase 1. This covers the task tree, the command palette,
recent tasks, pinned tasks, and `gradle.runBuild`. The other call sites of
`TaskServerClient.runBuild` — namely the public extension API
(`extension/src/api/Api.ts`) and the Build Server-driven Gradle test runner
(`extension/src/bs/GradleTestRunner.ts`) — remain on gRPC in Phase 1
because they need structured stdin (`input`) and per-frame `Output`
callbacks that the direct path does not provide yet.

`GetBuild`, `CancelBuild`, `CancelBuilds`, and `executeCommand` also stay
on gRPC for now.

The direct backend is chosen at run time when **all** of the following hold:

1. `gradle.taskExecution` is set to `"direct"`.
2. The project has a working `gradlew` — both
   `gradle/wrapper/gradle-wrapper.properties` _and_ the `gradlew` /
   `gradlew.bat` script exist at the root project directory.
3. The current run is initiated from `GradleRunnerTerminal` (i.e. user-driven
   task execution).

Otherwise the extension falls back to the gRPC `runBuild` path and logs the
reason via the `diag` channel. This guarantees zero behaviour change for
users who do not opt in, and zero regression for projects without a
wrapper.

### 3.3 Setting

A new VS Code setting is introduced:

```jsonc
"gradle.taskExecution": {
  "type": "string",
  "enum": ["server", "direct"],
  "enumDescriptions": [
    "Run Gradle tasks through the bundled Gradle server (default).",
    "Run Gradle tasks by spawning the project's Gradle wrapper as a child process. Use this as a workaround when the Gradle server's gRPC channel is intercepted by enterprise security software."
  ],
  "default": "server",
  "scope": "window"
}
```

The setting is `window`-scoped so it can be flipped per workspace without a
VS Code restart. Default stays at `"server"` for the first release; the
default can be revisited after telemetry confirms that the direct backend is
behaviourally equivalent.

### 3.4 Concurrency

When multiple tasks run in parallel (e.g. the test runner expanding into N
test classes), Phase 1 caps the number of in-flight `cp.spawn` calls at
`max(2, min(4, cpuCount / 2))`. This bounds the worst-case "spawn storm"
memory peak; the limit is high enough that interactive use is never queued.

When a task is queued waiting for a slot, the pseudo-terminal writes a one-line
notice (`> Waiting for a direct Gradle execution slot…`) so the user is not
left looking at a blank terminal.

### 3.5 Cancellation semantics

Cancellation in direct mode does **not** flow through
`TaskServerClient.cancelBuild()` (the gRPC RPC). The direct executor
registers each running child by its `cancellationKey` in a module-level
registry; `taskUtil.cancelBuild()` checks the registry before falling
back to the gRPC RPC. This guarantees that

- the existing cancel UI (the task tree, `Ctrl+C` inside the pseudo-terminal,
  the task-tree red square) all keep working without touching the
  call sites.
- if a build is mid-flight while the user switches `gradle.taskExecution`,
  the previously-spawned child is still cancellable.

On Windows, `gradlew.bat` is a `.bat` script, so spawning it goes through
`cmd.exe → java.exe`. Phase 1 takes a layered approach:

1. Spawn `gradlew.bat` through `cmd.exe /d /s /c "<wrapperPath>" <args>` with
   `windowsHide: true` and `windowsVerbatimArguments: true`. The wrapper
   path is pre-quoted by the executor, and `windowsVerbatimArguments: true`
   prevents Node from re-quoting and breaking that explicit quoting. This
   makes the child a normal `cmd.exe`-rooted process tree that we can later
   kill via `taskkill /T`.
2. On cancel, `process.kill('SIGBREAK')` is sent first (graceful path).
3. If the child is still alive after a 3 second grace period, escalate to
   `taskkill /T /F /PID <pid>` to force-kill the process tree.

Signal forwarding through `cmd.exe` is unreliable on some Windows versions;
the `taskkill` escalation guarantees the build dies even when the first
signal is dropped. The trade-off is that we lose the Tooling API's
cooperative cancellation token — a force-killed daemon-side build may leave
some stale lock files. That is acceptable because (a) the user explicitly
asked to cancel, and (b) the same behaviour already happens when a user
hits `Ctrl+C` in a terminal running `gradlew` manually.

On Unix the cancel path is `child.kill('SIGINT')` with a `SIGKILL` escalation
after the same 3 second grace period.

### 3.6 Java home and JVM arguments

The wrapper needs a Java runtime to launch. The direct backend follows the
same precedence as the gRPC backend's `setJavaHome(gradleConfig)`:

1. Read `java.import.gradle.java.home` (via the existing
   `getConfigJavaImportGradleJavaHome()` helper).
2. If set, override `JAVA_HOME` and prepend `<javaHome>/bin` to `PATH` in
   the child's environment.
3. If unset, inherit the parent process's `JAVA_HOME` / `PATH`.

We do **not** pass `-Dorg.gradle.java.home=…` — that flag controls the
daemon JVM only, not the wrapper client JVM, and is unnecessary because the
init script already targets `JavaExec` / `Test` tasks.

`java.import.gradle.jvmArguments`, if set, is passed via the `GRADLE_OPTS`
environment variable, which is the documented way to inject JVM options
into the wrapper client and into the daemon launch.

`additionalToolOptions` (currently used by the test runner for surefire-style
options) is exported as `JAVA_TOOL_OPTIONS`, matching what the Java side
does in `GradleBuildRunner.buildJavaEnvVarsWithToolOptions()`.

### 3.7 Java debug init script

The init script content is identical to the Java side (see
`GradleBuildRunner.java` lines 47-67). The TS port computes a SHA-256 of
the script content (truncated to 16 hex characters) and writes to
`<os.tmpdir()>/vscode-gradle-debug-init-<hash16>.gradle`. Using a
content-derived filename plus an atomic "write to `<file>.tmp` → rename"
sequence eliminates the read-compare-write race that the Java side has
when two simultaneous debug runs would otherwise observe a partial file.

The launched command line then includes `--init-script <file>` and
`-Dvscode.debug.port=<port>` (note: the system property is
`vscode.debug.port`, _not_ `gradle.debug.port` — the init script reads
`System.getProperty('vscode.debug.port')`).

### 3.8 What changes for users

- **No change** for users with `"gradle.taskExecution": "server"` (the
  default).
- **Users who flip to `"direct"`** get an EDR-immune task execution path at
  the cost of:
  - Loss of structured `OperationType.TASK` events (status-bar progress
    falls back to the same text Gradle CLI emits).
  - A one-time ~300 ms wrapper / client JVM start per task (negligible for
    builds that take seconds or longer).
- **Users on a project without `gradlew`** are silently kept on the gRPC
  path; the setting is treated as a hint, not a hard requirement.

## 4. Phase 1 scope (this change)

1. Add the `gradle.taskExecution` setting.
2. Add a `DirectTaskExecutor` module that spawns the wrapper, wires stdio,
   exposes a `cancel()` handle, and maintains a `cancellationKey →
handle` registry.
3. Branch in `GradleRunnerTerminal.runBuild()` between the existing
   gRPC client and the new executor.
4. Make `taskUtil.cancelBuild()` consult the direct registry before
   falling back to the gRPC `cancelBuild` RPC so all existing cancel UI
   keeps working unchanged.
5. Re-implement the Java-side debug init script in TypeScript (atomic
   write, content-hash filename) so the `javaDebugPort` flow is preserved
   end-to-end.
6. Cap concurrent direct executions with a small semaphore; emit a
   pseudo-terminal notice when a build is queued.
7. Add unit tests for: argument construction (including
   `-Dvscode.debug.port`), wrapper detection, cancel path, JAVA_HOME /
   `JAVA_TOOL_OPTIONS` / `GRADLE_OPTS` propagation, and init-script
   atomic write.

Phase 1 deliberately does **not** touch:

- The `getBuild` RPC (still on gRPC).
- The cancel RPCs (still on gRPC; in direct mode the cancel goes through
  the child-process signal path, not the gRPC `CancelBuild` RPC).
- The test runner (BSP path remains, with the gRPC fallback unchanged).
- Any proto/IDL/wire format on either side.

## 5. Out-of-scope / later phases

| Phase | Topic                                                                                                                                         | Rough size |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 2     | Make `getBuild` failures non-fatal (preserve cached task tree, surface a clear retry banner)                                                  | small      |
| 3     | Move `getBuild` off the gRPC channel — either via the existing BSP pipe (`build-server-for-gradle`) or via a one-shot Java helper using stdio | medium     |
| 4     | Default `gradle.taskExecution` to `"direct"` once Phase 1+2+3 metrics show no regression                                                      | trivial    |
| 5     | Retire the gRPC task channel altogether; keep `gradle-server` only for `language-server` + `build-server` bootstrapping                       | large      |

## 6. Risks and mitigations

| Risk                                                          | Mitigation                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gradlew` missing or broken                                   | Detect at runtime; silently fall back to the gRPC path; log the reason via `diag` so we have telemetry.                                                                                                       |
| Windows signal forwarding through `cmd.exe`                   | Use `CTRL_BREAK_EVENT` + `taskkill /T /F` escalation; see §3.5.                                                                                                                                               |
| Spawn storm on test-runner expansion                          | Concurrency semaphore; see §3.4.                                                                                                                                                                              |
| Java debug behaviour drift between server and direct backends | Re-use the **same init script content** as the server; covered by unit tests.                                                                                                                                 |
| User toggles the setting and loses structured progress        | Documented in §3.6; status-bar progress still renders, just less granular.                                                                                                                                    |
| Gradle daemon protocol is also TCP loopback                   | Out of our control (it's a private binary protocol from Gradle itself); empirical evidence shows EDRs do not inspect it. If they did, manual `gradlew` runs would also fail — which is not what users report. |

## 7. Telemetry

Each direct run records (via the existing `diag` instrumentation):

- `bid`, `cancellationKey`, project folder, args
- whether the wrapper was detected
- whether Java debug was requested
- `elapsedMs`, exit code, signal (on cancel)
- whether the fallback to gRPC was triggered, and the reason

This is the same shape as the existing `runBuild start` / `runBuild end` /
`runBuild error` log lines, so existing log-analysis scripts continue to
work.
