import * as vscode from "vscode";
import * as path from "path";
import { TaskArgs } from "../stores/types";
import { RootProject } from "../rootProject/RootProject";
import { RootProjectsStore } from "../stores";
import { getDisableConfirmations } from "./config";
import { GradleTaskProvider } from "../tasks";

function returnTrimmedInput(value: string | undefined): string | undefined {
    if (value !== undefined) {
        return value.trim();
    }
    return undefined;
}

export function getTaskArgs(): Thenable<TaskArgs | undefined> {
    return vscode.window
        .showInputBox({
            placeHolder: "For example: --info",
            ignoreFocusOut: true,
        })
        .then(returnTrimmedInput);
}

export function getGradleCommand(): Thenable<TaskArgs | undefined> {
    return vscode.window
        .showInputBox({
            prompt: [
                "Enter a command for gradle to run.",
                "This can include built-in Gradle commands or tasks.",
                "Not all Gradle command line options are supported.",
            ].join(" "),
            placeHolder: "For example: build --info",
            ignoreFocusOut: true,
        })
        .then(returnTrimmedInput);
}

export function getFindTask(gradleTaskProvider: GradleTaskProvider): Thenable<string | undefined> {
    return vscode.window.showQuickPick(
        gradleTaskProvider.loadTasks().then((tasks) => tasks.map((task) => task.name)),
        {
            placeHolder: "Search for a Gradle task",
            ignoreFocusOut: false,
            canPickMany: false,
        }
    );
}

export function getRunTasks(gradleTaskProvider: GradleTaskProvider, projectUri: string): Thenable<string | undefined> {
    const buildFilePath = path.join(vscode.Uri.parse(projectUri).fsPath, "build.gradle");
    return vscode.window.showQuickPick(
        gradleTaskProvider.loadTasks().then((tasks) =>
            tasks
                .filter((task) => {
                    const buildFile = task.definition.buildFile;
                    if (buildFile) {
                        if (vscode.Uri.file(buildFile).fsPath === buildFilePath) {
                            return true;
                        }
                    }
                    return false;
                })
                .map((task) => task.name)
        ),
        {
            placeHolder: "Select a Gradle task to run",
            ignoreFocusOut: true,
            canPickMany: false,
        }
    );
}

export async function getRootProjectFolder(rootProjectsStore: RootProjectsStore): Promise<RootProject | undefined> {
    const rootProjects = await rootProjectsStore.getProjectRoots();
    if (rootProjects.length === 1) {
        return Promise.resolve(rootProjects[0]);
    }
    const rootProjectPaths = rootProjects.map((rootProject) => rootProject.getProjectUri().fsPath);
    const selectedRootProjectPath = await vscode.window.showQuickPick(rootProjectPaths, {
        canPickMany: false,
        placeHolder: "Select the root project",
    });
    if (selectedRootProjectPath) {
        return rootProjects[rootProjectPaths.indexOf(selectedRootProjectPath)];
    }
    return undefined;
}

export async function confirmModal(message: string): Promise<boolean> {
    if (getDisableConfirmations()) {
        return true;
    }
    const CONFIRM = "Yes";
    const result = await vscode.window.showWarningMessage(message, { modal: true }, CONFIRM);
    return result === CONFIRM;
}
