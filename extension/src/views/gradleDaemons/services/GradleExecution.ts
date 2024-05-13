export interface GradleExecution {
    exec(args: string[]): Promise<string>;
}
