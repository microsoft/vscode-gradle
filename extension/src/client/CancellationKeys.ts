export function getBuildCancellationKey(rootProjectFolder: string): string {
    return "getBuild" + rootProjectFolder;
}

export function getProjectDependenciesCancellationKey(rootProjectFolder: string, projectPath: string): string {
    return ["getProjectDependencies", rootProjectFolder, projectPath].join("\u0000");
}

export function getRunBuildCancellationKey(rootProjectFolder: string, args: ReadonlyArray<string>): string {
    return "runBuild" + rootProjectFolder + args.join("");
}

export function getRunTaskCommandCancellationKey(rootProjectFolder: string, taskName: string): string {
    return "runTask" + rootProjectFolder + taskName;
}
