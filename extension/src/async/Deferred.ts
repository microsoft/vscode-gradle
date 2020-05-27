export class Deferred<T> {
  public promise: Promise<T>;

  private _resolve?: Function;
  private _reject?: Function;

  constructor() {
    this.promise = new Promise(
      (resolve: (value?: T) => void, reject: (reason?: Error) => void) => {
        this._resolve = resolve;
        this._reject = reject;
      }
    );
  }

  resolve(value?: T): void {
    this._resolve!(value);
  }

  reject(reason?: Error): void {
    this._reject!(reason);
  }
}
