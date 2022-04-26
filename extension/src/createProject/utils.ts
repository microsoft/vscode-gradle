// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { debounce } from "lodash";

export function asyncDebounce(func: any, wait: any, bind: any) {
    const debounced = debounce(async (resolve, reject, bindSelf, args) => {
        try {
            const result = await func.bind(bindSelf)(...args);
            resolve(result);
        } catch (error) {
            reject(error);
        }
    }, wait);

    function returnFunc(...args: any[]) {
        return new Promise((resolve, reject) => {
            debounced(resolve, reject, bind, args);
        });
    }

    return returnFunc;
}
