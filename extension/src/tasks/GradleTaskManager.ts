import * as vscode from "vscode";
import { isGradleTask, getRunningGradleTasks } from "./taskUtil";

export class GradleTaskManager implements vscode.Disposable {
    private readonly _onDidStartTask: vscode.EventEmitter<vscode.Task> = new vscode.EventEmitter<vscode.Task>();
    private readonly _onDidEndTask: vscode.EventEmitter<vscode.Task> = new vscode.EventEmitter<vscode.Task>();
    private readonly _onDidEndAllTasks: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();

    public readonly onDidStartTask: vscode.Event<vscode.Task> = this._onDidStartTask.event;
    public readonly onDidEndTask: vscode.Event<vscode.Task> = this._onDidEndTask.event;
    public readonly onDidEndAllTasks: vscode.Event<null> = this._onDidEndAllTasks.event;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.context.subscriptions.push(
            vscode.tasks.onDidStartTask((e: vscode.TaskStartEvent) => {
                if (isGradleTask(e.execution.task)) {
                    this._onDidStartTask.fire(e.execution.task);
                }
            }),
            vscode.tasks.onDidEndTask((e: vscode.TaskEndEvent) => {
                if (isGradleTask(e.execution.task)) {
                    this._onDidEndTask.fire(e.execution.task);
                    if (getRunningGradleTasks().length === 0) {
                        this._onDidEndAllTasks.fire(null);
                    }
                }
            })
        );
    }

    public dispose(): void {
        this._onDidStartTask.dispose();
        this._onDidEndAllTasks.dispose();
    }
}
