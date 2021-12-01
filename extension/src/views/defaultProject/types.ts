// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Range } from "vscode-languageclient/node";

export interface DefaultDependencyItem {
    name: string;
    configuration: string;
    range: Range;
}

export interface DefaultTaskDefinition {
    name: string;
    group: string;
    description: string;
}
