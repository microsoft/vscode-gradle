export interface RunBuildArgs {
    /** Path of the build file (or of the directory) of the project to run the build in */
    buildFile?: string;
    /** The Gradle command line, tasks and options */
    command?: string;
    /** Environment variables for the build */
    environment?: RunBuildEnvironment;
    /** What to do besides the build */
    options?: RunBuildOptions;
}

/**
 * The outcome of a build that was run with arguments and was not a failure. A failure rejects the command,
 * which the caller of the command sees as no result.
 */
export interface RunBuildResult {
    status: "succeeded" | "cancelled";
}

export type RunBuildEnvironment = { [name: string]: string };

export interface RunBuildOptions {
    /**
     * Reload the Java project of the build (in the Java extension, the equivalent of "Update Project") after
     * the build succeeded. For builds that generate sources, for example.
     */
    refreshJavaProject?: boolean;
}
