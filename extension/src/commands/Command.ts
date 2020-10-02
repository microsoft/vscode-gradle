export abstract class Command {
  public abstract async run(...args: unknown[]): Promise<unknown>;
}
