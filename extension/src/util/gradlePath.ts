export function normalizeGradleProjectPath(projectPath: string | undefined): string {
    const segments = (projectPath || "").split(":").filter(Boolean);
    return segments.length === 0 ? ":" : `:${segments.join(":")}`;
}

export function getGradleProjectPathFromTaskPath(taskPath: string): string {
    const segments = taskPath.split(":").filter(Boolean).slice(0, -1);
    return normalizeGradleProjectPath(segments.join(":"));
}
