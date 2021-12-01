export abstract class Command {
    public abstract run(...args: unknown[]): Promise<unknown>;
}
