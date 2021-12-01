// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { GradleDaemonsTreeDataProvider } from "../views";
import { Command } from "./Command";
export const HIDE_STOPPED_DAEMONS = "gradle.hideStoppedDaemons";

export class HideStoppedDaemonsCommand extends Command {
    constructor(private gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider) {
        super();
    }

    async run(): Promise<void> {
        this.gradleDaemonsTreeDataProvider.hideStoppedDaemons();
    }
}
