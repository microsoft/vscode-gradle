function noop() {}

export default class Deferred {
  resolve: Function;
  reject: Function;
  promise: Promise<any>;

  constructor() {
    this.resolve = noop;
    this.reject = noop;
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
