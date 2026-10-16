import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { Extension } from "../../Extension";
import { RecentTasksStore, TaskTerminalsStore } from "../../stores";
import { buildMockTaskDefinition, buildMockTerminal, buildMockWorkspaceFolder } from "../testUtil";

describe("Extension task terminals", () => {
    const workspaceFolder = buildMockWorkspaceFolder(0, "workspace", "workspace");
    let started: vscode.EventEmitter<vscode.Task>;
    let ended: vscode.EventEmitter<vscode.Task>;
    let opened: vscode.EventEmitter<vscode.Terminal>;
    let extension: sinon.SinonStubbedInstance<Extension>;

    beforeEach(() => {
        started = new vscode.EventEmitter<vscode.Task>();
        ended = new vscode.EventEmitter<vscode.Task>();
        opened = new vscode.EventEmitter<vscode.Terminal>();
        extension = sinon.createStubInstance(Extension);
        Object.defineProperties(extension, {
            gradleTaskManager: {
                value: { onDidStartTask: started.event, onDidEndTask: ended.event },
            },
            onDidTerminalOpen: { value: opened.event },
            gradleTasksTreeView: { value: { visible: false } },
            taskTerminalsStore: { value: sinon.createStubInstance(TaskTerminalsStore) },
            recentTasksStore: { value: sinon.createStubInstance(RecentTasksStore) },
            handleTaskTerminals: { value: Extension.prototype["handleTaskTerminals"] },
        });
        sinon.stub(vscode.commands, "executeCommand").resolves();
        Extension.prototype["handleTaskEvents"].call(extension);
    });

    afterEach(() => {
        started.dispose();
        ended.dispose();
        opened.dispose();
        sinon.restore();
    });

    for (const terminalOpensFirst of [true, false]) {
        for (const focus of [false, true, undefined]) {
            it(`respects focus=${focus} when the terminal opens ${
                terminalOpensFirst ? "before" : "after"
            } task start`, () => {
                const terminal = buildMockTerminal("Task - assemble");
                const task = new vscode.Task(
                    buildMockTaskDefinition(workspaceFolder),
                    workspaceFolder,
                    "assemble",
                    "gradle"
                );
                task.presentationOptions = { focus };
                if (terminalOpensFirst) {
                    extension["recentTerminal"] = terminal;
                }

                started.fire(task);
                if (!terminalOpensFirst) {
                    opened.fire(terminal);
                }

                sinon.assert.calledOnce(terminal.show);
                assert.strictEqual(terminal.show.firstCall.args[0] === true, focus === false);
            });
        }
    }
});
