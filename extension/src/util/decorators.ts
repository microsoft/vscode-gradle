// Taken from https://github.com/microsoft/vscode/blob/main/src/vs/base/common/decorators.ts

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
export function createDecorator(mapFn: (fn: Function, key: string) => Function): Function {
    return (_target: any, key: string, descriptor: any): void => {
        let fnKey: string | null = null;
        let fn: Function | null = null;

        if (typeof descriptor.value === "function") {
            fnKey = "value";
            fn = descriptor.value;
        } else if (typeof descriptor.get === "function") {
            fnKey = "get";
            fn = descriptor.get;
        }

        if (!fn) {
            throw new Error("not supported");
        }

        descriptor[fnKey!] = mapFn(fn, key);
    };
}

export interface DebounceReducer<T> {
    (previousValue: T, ...args: any[]): T;
}

export function debounce(delay: number): Function {
    return createDecorator((fn, key) => {
        const timerKey = `$debounce$${key}`;
        return function (this: any, ...args: any[]): void {
            clearTimeout(this[timerKey]);
            this[timerKey] = setTimeout(() => {
                fn.apply(this, args);
            }, delay);
        };
    });
}
