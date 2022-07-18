// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Command } from "./Command";
import { RefreshCommand } from "./RefreshCommand";

export const COMMAND_REFRESH_EXTERNAL = "gradle.refresh.external";

/**
 * Used for collecting telemetry of refresh command from external UI.
 */
export class RefreshExternalCommand extends Command {
    constructor(private refreshCommand: RefreshCommand) {
        super();
    }
    async run(): Promise<void> {
        this.refreshCommand.run();
    }
}
