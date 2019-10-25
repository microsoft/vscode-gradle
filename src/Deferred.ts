function noop() {}

export default class Deferred {
  resolve: Function = noop;
  reject: Function = noop;
  promise: Promise<any>;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
