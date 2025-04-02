import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
    const extension = vscode.extensions.getExtension("vscjava.vscode-gradle");
    if (extension) {
        extension.activate().then((exports) => {
            console.log(exports);
            context.subscriptions.push(
                exports.registerToolOptionsProvider({
                    async resolveToolOptions(): Promise<string> {
                        return "-DtoolOptionsTest=true";
                    },
                })
            );
        });
    }
}
