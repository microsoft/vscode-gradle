import * as vscode from "vscode";
import { debounce } from "../util/decorators";

export abstract class EventedStore<V> implements vscode.Disposable {
    private readonly _onDidChange: vscode.EventEmitter<V | null> = new vscode.EventEmitter<V>();
    public readonly onDidChange: vscode.Event<V | null> = this._onDidChange.event;

    @debounce(0)
    public fireOnDidChange(value: V | null): void {
        this._onDidChange.fire(value);
    }

    public dispose(): void {
        this._onDidChange.dispose();
    }
}
