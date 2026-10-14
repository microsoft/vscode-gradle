export interface RunBuildArgs {
    /** Path of the build file (or of the directory) of the project to run the build in */
    buildFile?: string;
    /** The Gradle command line, tasks and options */
    command?: string;
    /** Environment variables for the build */
    environment?: RunBuildEnvironment;
}

export type RunBuildEnvironment = { [name: string]: string };
