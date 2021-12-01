// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { GradleDaemonsTreeDataProvider } from "../views";
import { Command } from "./Command";
export const SHOW_STOPPED_DAEMONS = "gradle.showStoppedDaemons";

export class ShowStoppedDaemonsCommand extends Command {
    constructor(private gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider) {
        super();
    }

    async run(): Promise<void> {
        this.gradleDaemonsTreeDataProvider.showStoppedDaemons();
    }
}
