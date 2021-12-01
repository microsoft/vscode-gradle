import * as vscode from "vscode";
import * as path from "path";
import { ICON_LOADING, ICON_GRADLE_TASK } from "../views/constants";

export type IconPath = {
    light: string | vscode.Uri;
    dark: string | vscode.Uri;
};

export class Icons {
    public iconPathRunning?: IconPath;
    public iconPathIdle?: IconPath;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.iconPathRunning = {
            light: this.context.asAbsolutePath(path.join("resources", "light", ICON_LOADING)),
            dark: this.context.asAbsolutePath(path.join("resources", "dark", ICON_LOADING)),
        };
        this.iconPathIdle = {
            light: this.context.asAbsolutePath(path.join("resources", "light", ICON_GRADLE_TASK)),
            dark: this.context.asAbsolutePath(path.join("resources", "dark", ICON_GRADLE_TASK)),
        };
    }
}
