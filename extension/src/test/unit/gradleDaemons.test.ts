/* eslint-disable @typescript-eslint/no-explicit-any */

import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import * as path from "path";

import {
    GetDaemonsStatusReply,
    DaemonInfo,
    StopDaemonReply,
    StopDaemonsReply,
    Environment,
    GradleEnvironment,
} from "../../proto/gradle_pb";
import { GradleDaemonsTreeDataProvider, GradleDaemonTreeItem } from "../../views";
// import { Extension } from '../../extension';
import { SinonStub } from "sinon";
import { logger } from "../../logger";
import {
    getSuiteName,
    resetObjectStubs,
    buildMockOutputChannel,
    buildMockWorkspaceFolder,
    buildMockClient,
    buildMockContext,
    stubWorkspaceFolders,
} from "../testUtil";
import { IconPath } from "../../icons";
import { ICON_DAEMON_STOPPED, ICON_DAEMON_BUSY, ICON_DAEMON_IDLE } from "../../views/constants";
import { RootProjectsStore } from "../../stores";
import { RefreshDaemonStatusCommand, StopDaemonCommand, StopDaemonsCommand } from "../../commands";
import { sleep } from "../../util";

const mockContext = buildMockContext();
const mockClient = buildMockClient();

const mockWorkspaceFolder1 = buildMockWorkspaceFolder(0, "folder1", "folder1");
const mockWorkspaceFolder2 = buildMockWorkspaceFolder(1, "folder2", "folder2");
const mockWorkspaceFolder3 = buildMockWorkspaceFolder(2, "folder3", "folder3");

const mockOutputChannel = buildMockOutputChannel();

describe(getSuiteName("Gradle daemons"), () => {
    let gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider;
    let rootProjectsStore: RootProjectsStore;
    beforeEach(async () => {
        rootProjectsStore = new RootProjectsStore();
        gradleDaemonsTreeDataProvider = new GradleDaemonsTreeDataProvider(mockContext, rootProjectsStore, mockClient);
        stubWorkspaceFolders([mockWorkspaceFolder1, mockWorkspaceFolder2, mockWorkspaceFolder3]);

        await rootProjectsStore.populate();

        // GradleClient.getBuild() sets the gradle versions once it receives the gradle environment
        const projectRoots = await rootProjectsStore.getProjectRoots();
        const gradleEnvironment1 = new GradleEnvironment();
        gradleEnvironment1.setGradleVersion("6.3");
        const environment1 = new Environment();
        environment1.setGradleEnvironment(gradleEnvironment1);
        projectRoots[0].setEnvironment(environment1);

        const gradleEnvironment2 = new GradleEnvironment();
        gradleEnvironment2.setGradleVersion("6.4");
        const environment2 = new Environment();
        environment2.setGradleEnvironment(gradleEnvironment2);
        projectRoots[1].setEnvironment(environment2);

        // Should be ignored as it has a duplicate gradle version
        const gradleEnvironment3 = new GradleEnvironment();
        gradleEnvironment3.setGradleVersion("6.4");
        const environment3 = new Environment();
        environment3.setGradleEnvironment(gradleEnvironment3);
        projectRoots[2].setEnvironment(environment3);

        logger.reset();
        logger.setLoggingChannel(mockOutputChannel);
    });

    afterEach(() => {
        resetObjectStubs(mockOutputChannel);
        sinon.restore();
    });

    it("should filter out projects with duplicate gradle versions", async () => {
        const projects = await rootProjectsStore.getProjectRootsWithUniqueVersions();
        assert.strictEqual(projects.length, 2, "There should only be two projects with unique gradle versions");
    });

    it("should build the daemon treeitems", async () => {
        await vscode.workspace.getConfiguration("gradle").update("showStoppedDaemons", true, true);

        const mockDaemonInfoBusy = new DaemonInfo();
        mockDaemonInfoBusy.setStatus(DaemonInfo.DaemonStatus.BUSY);
        mockDaemonInfoBusy.setPid("41716");
        mockDaemonInfoBusy.setInfo("6.3");

        const mockDaemonInfoIdle = new DaemonInfo();
        mockDaemonInfoIdle.setStatus(DaemonInfo.DaemonStatus.IDLE);
        mockDaemonInfoIdle.setPid("41717");
        mockDaemonInfoIdle.setInfo("6.4");

        const mockDaemonInfoStopped = new DaemonInfo();
        mockDaemonInfoStopped.setStatus(DaemonInfo.DaemonStatus.STOPPED);
        mockDaemonInfoStopped.setPid("41718");
        mockDaemonInfoStopped.setInfo("(by user or operating system)");

        const mockReply1 = new GetDaemonsStatusReply();
        mockReply1.setDaemonInfoList([mockDaemonInfoBusy, mockDaemonInfoStopped]);

        const mockReply2 = new GetDaemonsStatusReply();
        mockReply2.setDaemonInfoList([mockDaemonInfoIdle, mockDaemonInfoStopped]);

        mockClient.getDaemonsStatus.withArgs(mockWorkspaceFolder1.uri.fsPath).resolves(mockReply1);
        mockClient.getDaemonsStatus.withArgs(mockWorkspaceFolder2.uri.fsPath).resolves(mockReply2);
        // NOTE: no reason to mock reply for mockWorkspaceFolder3 as it should be ignored due to
        // dupicate gradle version

        let children = await gradleDaemonsTreeDataProvider.getChildren();

        assert.strictEqual(children.length, 4, "There should be 4 items in the tree");

        const treeItemBusy = children[0];
        assert.strictEqual(treeItemBusy.label, "41716");
        assert.strictEqual(treeItemBusy.description, "BUSY");
        assert.strictEqual(treeItemBusy.contextValue, "busy");
        assert.strictEqual(treeItemBusy.tooltip, "BUSY - 6.3");
        assert.strictEqual(treeItemBusy.collapsibleState, vscode.TreeItemCollapsibleState.None);
        const busyIconPath = treeItemBusy.iconPath as IconPath;
        assert.strictEqual(busyIconPath.dark, path.join("resources", "dark", ICON_DAEMON_BUSY));
        assert.strictEqual(busyIconPath.light, path.join("resources", "light", ICON_DAEMON_BUSY));

        const treeItemStopped = children[1];
        assert.strictEqual(treeItemStopped.label, "41718");
        assert.strictEqual(treeItemStopped.description, "STOPPED");
        assert.strictEqual(treeItemStopped.contextValue, "stopped");
        assert.strictEqual(treeItemStopped.tooltip, "STOPPED - (by user or operating system)");
        assert.strictEqual(treeItemStopped.collapsibleState, vscode.TreeItemCollapsibleState.None);
        const stoppedIconPath = treeItemStopped.iconPath as IconPath;
        assert.strictEqual(stoppedIconPath.dark, path.join("resources", "dark", ICON_DAEMON_STOPPED));
        assert.strictEqual(stoppedIconPath.light, path.join("resources", "light", ICON_DAEMON_STOPPED));

        const treeItemIdle = children[2];
        assert.strictEqual(treeItemIdle.label, "41717");
        assert.strictEqual(treeItemIdle.description, "IDLE");
        assert.strictEqual(treeItemIdle.contextValue, "idle");
        assert.strictEqual(treeItemIdle.tooltip, "IDLE - 6.4");
        assert.strictEqual(treeItemIdle.collapsibleState, vscode.TreeItemCollapsibleState.None);
        const idleIconPath = treeItemIdle.iconPath as IconPath;
        assert.strictEqual(idleIconPath.dark, path.join("resources", "dark", ICON_DAEMON_IDLE));
        assert.strictEqual(idleIconPath.light, path.join("resources", "light", ICON_DAEMON_IDLE));

        // test for hide stopped daemons
        await vscode.workspace.getConfiguration("gradle").update("showStoppedDaemons", false, true);

        children = await gradleDaemonsTreeDataProvider.getChildren();

        assert.strictEqual(children.length, 2, "There should be 2 items in the tree");
    });

    it("should stop a daemon", async () => {
        const mockReply = new StopDaemonReply();
        mockReply.setMessage("Stopped");
        mockClient.stopDaemon.resolves(mockReply);

        const showWarningMessageStub = (sinon.stub(vscode.window, "showWarningMessage") as SinonStub).resolves("Yes");

        const mockDaemonInfoBusy = new DaemonInfo();
        mockDaemonInfoBusy.setStatus(DaemonInfo.DaemonStatus.BUSY);
        mockDaemonInfoBusy.setPid("41716");
        mockDaemonInfoBusy.setInfo("6.4");

        const mockGradleDaemonTreeItem = new GradleDaemonTreeItem(
            mockContext,
            mockDaemonInfoBusy.getPid(),
            mockDaemonInfoBusy
        );

        await new StopDaemonCommand(mockClient).run(mockGradleDaemonTreeItem);

        assert.ok(
            showWarningMessageStub.calledWith("Are you sure you want to stop the daemon?"),
            "Stop daemon confirmation message not shown"
        );
        assert.strictEqual(showWarningMessageStub.callCount, 1);
        assert.ok(
            mockClient.stopDaemon.calledWith(mockDaemonInfoBusy.getPid()),
            "Client stopDaemon not called with daemon PID"
        );
        assert.strictEqual(mockClient.stopDaemon.callCount, 1);
        assert.ok(
            mockOutputChannel.appendLine.calledWith("[info] Stopped"),
            "Output channel appendLine not called with correct message"
        );
        assert.strictEqual(mockOutputChannel.appendLine.callCount, 1);
    });

    it("should stop all daemons", async () => {
        const mockReply1 = new StopDaemonsReply();
        mockReply1.setMessage("Stopped 1");
        const mockReply2 = new StopDaemonsReply();
        mockReply2.setMessage("Stopped 2");

        mockClient.stopDaemons.withArgs(mockWorkspaceFolder1.uri.fsPath).resolves(mockReply1);
        mockClient.stopDaemons.withArgs(mockWorkspaceFolder2.uri.fsPath).resolves(mockReply2);

        const showWarningMessageStub = (sinon.stub(vscode.window, "showWarningMessage") as SinonStub).resolves("Yes");

        await new StopDaemonsCommand(mockClient, rootProjectsStore).run();

        assert.ok(
            showWarningMessageStub.calledWith("Are you sure you want to stop the daemons?"),
            "Stop daemons confirmation message not shown"
        );

        assert.strictEqual(mockOutputChannel.appendLine.callCount, 2, "Logger not called expected times");
        assert.ok(mockOutputChannel.appendLine.calledWith("[info] Stopped 1"), "Reply for folder 1 not logged");
        assert.ok(mockOutputChannel.appendLine.calledWith("[info] Stopped 2"), "Reply for folder 2 not logged");
    });

    it("should refresh the daemons list", async () => {
        const onDidChangeSpy = sinon.spy();
        gradleDaemonsTreeDataProvider.onDidChangeTreeData(onDidChangeSpy);
        await new RefreshDaemonStatusCommand(gradleDaemonsTreeDataProvider).run();
        assert.ok(onDidChangeSpy.calledWith(), "onDidChangeTreeData not called");
        assert.strictEqual(onDidChangeSpy.callCount, 1);
    });

    it("should prevent queing of daemon status requests", async () => {
        const mockReply1 = new GetDaemonsStatusReply();
        const mockDaemonInfoBusy = new DaemonInfo();
        mockDaemonInfoBusy.setStatus(DaemonInfo.DaemonStatus.BUSY);
        mockDaemonInfoBusy.setPid("41716");
        mockDaemonInfoBusy.setInfo("6.4");
        mockReply1.setDaemonInfoList([mockDaemonInfoBusy]);
        const quickReply = Promise.resolve(mockReply1);

        const mockReply2 = new GetDaemonsStatusReply();
        const mockDaemonInfoIdle = new DaemonInfo();
        mockDaemonInfoIdle.setStatus(DaemonInfo.DaemonStatus.IDLE);
        mockDaemonInfoIdle.setPid("41716");
        mockDaemonInfoIdle.setInfo("6.4 f00");
        mockReply2.setDaemonInfoList([mockDaemonInfoIdle]);
        const longReply = new Promise((resolve) => {
            setTimeout(() => {
                resolve(mockReply2);
            }, 1000);
        });

        const workspaceFolder1: vscode.WorkspaceFolder = {
            index: 0,
            uri: vscode.Uri.file("folder1"),
            name: "folder1",
        };

        sinon.stub(vscode.workspace, "workspaceFolders").value([workspaceFolder1]);

        mockClient.getDaemonsStatus.withArgs(mockWorkspaceFolder1.uri.fsPath).returns(quickReply);

        const children = await gradleDaemonsTreeDataProvider.getChildren();

        assert.strictEqual(children[0].description, "BUSY");

        mockClient.getDaemonsStatus.withArgs(mockWorkspaceFolder1.uri.fsPath).returns(longReply);

        await new Promise(async (resolve, reject) => {
            // This call will return the previous results (quickReply) as we've cancelled
            // the request with the subsequent call to refresh()
            gradleDaemonsTreeDataProvider
                .getChildren()
                .then((_children: vscode.TreeItem[]) => {
                    assert.strictEqual(_children[0].description, "BUSY");
                })
                .catch(reject);
            // This call will return the correct results (longReply)
            gradleDaemonsTreeDataProvider.refresh();
            await sleep(1000);
            gradleDaemonsTreeDataProvider
                .getChildren()
                .then((_children: vscode.TreeItem[]) => {
                    assert.strictEqual(_children[0].description, "IDLE");
                    resolve(undefined);
                })
                .catch(reject);
        });
    });
});
