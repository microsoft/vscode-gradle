// Diagnostic helpers for issue #1815 / PR #1820 follow-up investigation.
// Every line emitted via these helpers is tagged `[diag]` and goes through
// `logger.info`/`warn`/`error` unconditionally (no setting required) so a
// single `Save As...` of the "Gradle for Java" output channel is enough to
// root-cause failures from a user's machine.
//
// This file is intentionally easy to delete once the investigation closes.

import { logger } from "../logger";
import { connectivityState as ConnectivityState } from "@grpc/grpc-js";

export const DIAG_TAG = "[diag]";

// Map of in-flight runBuild calls. Used so we can dump what was in flight when
// the server exits, the channel transitions to TRANSIENT_FAILURE, the
// extension host shuts down, etc.
export interface ActiveBuildInfo {
    bid: string;
    cancellationKey: string;
    args: string;
    projectFolder: string;
    startedAt: number;
    bytesIn: number;
    progressEvents: number;
    outputEvents: number;
}

const activeBuilds = new Map<string, ActiveBuildInfo>();

export function registerBuild(info: ActiveBuildInfo): void {
    activeBuilds.set(info.bid, info);
}

export function unregisterBuild(bid: string): void {
    activeBuilds.delete(bid);
}

export function getActiveBuild(bid: string): ActiveBuildInfo | undefined {
    return activeBuilds.get(bid);
}

export function activeBuildSnapshot(): string {
    if (activeBuilds.size === 0) {
        return "none";
    }
    return [...activeBuilds.values()]
        .map(
            (b) =>
                `bid=${b.bid} key=${b.cancellationKey} args="${b.args}" elapsedMs=${Date.now() - b.startedAt} bytesIn=${
                    b.bytesIn
                } progress=${b.progressEvents} output=${b.outputEvents}`
        )
        .join(" || ");
}

export function activeBuildCount(): number {
    return activeBuilds.size;
}

export function genBuildId(): string {
    // 6 chars is enough for human-grepability, no need for full uuid.
    return Math.random().toString(36).slice(2, 8);
}

export function channelStateName(state: ConnectivityState | undefined): string {
    if (state === undefined) {
        return "UNKNOWN";
    }
    return ConnectivityState[state] ?? `state(${state})`;
}

export function shortStack(skipFrames = 2): string {
    // Skip "Error", shortStack frame, and one caller frame by default.
    const stack = new Error().stack ?? "";
    const lines = stack.split("\n").slice(skipFrames + 1);
    // Trim absolute paths to keep logs readable.
    return lines
        .slice(0, 8)
        .map((l) => l.trim().replace(/\\+/g, "/"))
        .join(" <- ");
}

export function heapSnapshot(): string {
    const m = process.memoryUsage();
    const mb = (n: number) => Math.round(n / 1024 / 1024);
    return `rssMB=${mb(m.rss)} heapUsedMB=${mb(m.heapUsed)}/${mb(m.heapTotal)} externalMB=${mb(m.external)}`;
}

export function diagInfo(message: string): void {
    const line = `${DIAG_TAG} ${message}`;
    if (logger.getChannel()) {
        logger.info(line);
    } else {
        // OutputChannel not created yet (very early activate / after dispose).
        // Falling back to console keeps the message in the Extension Host log
        // so we never lose data and never break activation by throwing.
        console.log(`[gradle-for-java] ${line}`);
    }
}

export function diagWarn(message: string): void {
    const line = `${DIAG_TAG} ${message}`;
    if (logger.getChannel()) {
        logger.warn(line);
    } else {
        console.warn(`[gradle-for-java] ${line}`);
    }
}

export function diagError(message: string): void {
    const line = `${DIAG_TAG} ${message}`;
    if (logger.getChannel()) {
        logger.error(line);
    } else {
        console.error(`[gradle-for-java] ${line}`);
    }
}

// Heartbeat — only ticks while builds are in flight so it doesn't pollute logs
// when nothing is happening.
let heartbeatTimer: NodeJS.Timeout | undefined;
let heartbeatChannelStateProvider: (() => ConnectivityState | undefined) | undefined;

export function startHeartbeat(channelStateProvider: () => ConnectivityState | undefined): void {
    heartbeatChannelStateProvider = channelStateProvider;
    if (heartbeatTimer) {
        return;
    }
    heartbeatTimer = setInterval(() => {
        if (activeBuilds.size === 0) {
            return;
        }
        diagInfo(
            `heartbeat activeBuilds=${activeBuilds.size} channel=${channelStateName(
                heartbeatChannelStateProvider?.()
            )} ${heapSnapshot()} :: ${activeBuildSnapshot()}`
        );
    }, 5000);
    if (heartbeatTimer.unref) {
        heartbeatTimer.unref();
    }
}

export function stopHeartbeat(): void {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
    }
}
