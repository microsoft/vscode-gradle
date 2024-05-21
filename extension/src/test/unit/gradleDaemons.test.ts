/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import * as path from "path";

import { Environment, GradleEnvironment } from "../../proto/gradle_pb";
import { DaemonInfo } from "../../views/gradleDaemons/models/DaemonInfo";
import { DaemonStatus } from "../../views/gradleDaemons/models/DaemonStatus";
import { GradleDaemonsTreeDataProvider, GradleDaemonTreeItem } from "../../views";
import { SinonStub } from "sinon";
import { logger } from "../../logger";
import {
    getSuiteName,
    resetObjectStubs,
    buildMockOutputChannel,
    buildMockWorkspaceFolder,
    buildMockContext,
    stubWorkspaceFolders,
} from "../testUtil";
import { IconPath } from "../../icons";
import { ICON_DAEMON_STOPPED, ICON_DAEMON_BUSY, ICON_DAEMON_IDLE } from "../../views/constants";
import { RootProjectsStore } from "../../stores";
import { RefreshDaemonStatusCommand, StopDaemonCommand, StopDaemonsCommand } from "../../commands";
import { sleep } from "../../util";
import { GradleStatus } from "../../views/gradleDaemons/services/GradleStatus";
import { GradleConnectionType } from "../../views/gradleDaemons/models/GradleConnectionType";

const mockContext = buildMockContext();

const mockWorkspaceFolder1 = buildMockWorkspaceFolder(0, "folder1", "folder1");
const mockWorkspaceFolder2 = buildMockWorkspaceFolder(1, "folder2", "folder2");
const mockWorkspaceFolder3 = buildMockWorkspaceFolder(2, "folder3", "folder3");

const mockOutputChannel = buildMockOutputChannel();

describe(getSuiteName("Gradle daemons"), () => {
    let gradleDaemonsTreeDataProvider: GradleDaemonsTreeDataProvider;
    let rootProjectsStore: RootProjectsStore;
    beforeEach(async () => {
        rootProjectsStore = new RootProjectsStore();
        gradleDaemonsTreeDataProvider = new GradleDaemonsTreeDataProvider(mockContext, rootProjectsStore);
        stubWorkspaceFolders([mockWorkspaceFolder1, mockWorkspaceFolder2, mockWorkspaceFolder3]);

        await rootProjectsStore.populate();

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

        const mockDaemonInfoBusy = new DaemonInfo("41716", DaemonStatus.BUSY, "6.3");
        const mockDaemonInfoIdle = new DaemonInfo("41717", DaemonStatus.IDLE, "6.4");
        const mockDaemonInfoStopped = new DaemonInfo("41718", DaemonStatus.STOPPED, "(by user or operating system)");

        sinon
            .stub(GradleStatus, "getDaemonsStatusList")
            .withArgs(mockWorkspaceFolder1.uri.fsPath)
            .resolves([mockDaemonInfoBusy, mockDaemonInfoStopped])
            .withArgs(mockWorkspaceFolder2.uri.fsPath)
            .resolves([mockDaemonInfoIdle, mockDaemonInfoStopped]);

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
        const mockDaemonInfoBusy = new DaemonInfo("41716", DaemonStatus.BUSY, "6.3");
        const mockGradleDaemonTreeItem = new GradleDaemonTreeItem(
            mockContext,
            mockDaemonInfoBusy.getPid(),
            mockDaemonInfoBusy
        );

        const showWarningMessageStub = (sinon.stub(vscode.window, "showWarningMessage") as SinonStub).resolves("Yes");
        const mockStopDaemonCommand = new StopDaemonCommand();
        sinon.stub(mockStopDaemonCommand, "stopDaemon").withArgs(mockDaemonInfoBusy.getPid()).resolves();

        await mockStopDaemonCommand.run(mockGradleDaemonTreeItem);

        assert.ok(
            showWarningMessageStub.calledWith("Are you sure you want to stop the daemon?"),
            "Stop daemon confirmation message not shown"
        );

        assert.ok(
            mockOutputChannel.appendLine.calledWith("[info] Successfully stopped daemon with PID 41716."),
            "Output channel appendLine not called with correct message"
        );
        assert.strictEqual(mockOutputChannel.appendLine.callCount, 1);
    });

    it("should stop all daemons", async () => {
        const showWarningMessageStub = (sinon.stub(vscode.window, "showWarningMessage") as SinonStub).resolves("Yes");
        sinon.stub(GradleStatus, "getConnectionType").withArgs(sinon.match.any).resolves(GradleConnectionType.WRAPPER);

        const mockStopDaemonsCommand = new StopDaemonsCommand(rootProjectsStore);
        sinon.stub(mockStopDaemonsCommand, "stopDaemons").resolves();

        await mockStopDaemonsCommand.run();

        assert.ok(
            showWarningMessageStub.calledWith("Are you sure you want to stop the daemons?"),
            "Stop daemons confirmation message not shown"
        );

        assert.ok(
            mockOutputChannel.appendLine.calledWith("[info] Successfully stopped all daemons."),
            "Output channel appendLine not called with correct message"
        );

        showWarningMessageStub.restore();
    });

    it("should refresh the daemons list", async () => {
        const onDidChangeSpy = sinon.spy();
        gradleDaemonsTreeDataProvider.onDidChangeTreeData(onDidChangeSpy);
        await new RefreshDaemonStatusCommand(gradleDaemonsTreeDataProvider).run();
        assert.ok(onDidChangeSpy.calledWith(), "onDidChangeTreeData not called");
        assert.strictEqual(onDidChangeSpy.callCount, 1);
    });

    it("should prevent queuing of daemon status requests", async () => {
        const mockDaemonInfoBusy = new DaemonInfo("41716", DaemonStatus.BUSY, "6.4");
        const mockDaemonInfoIdle = new DaemonInfo("41716", DaemonStatus.IDLE, "6.4 f00");

        const quickReply: Promise<DaemonInfo[]> = Promise.resolve([mockDaemonInfoBusy]);

        const longReply: Promise<DaemonInfo[]> = new Promise((resolve) => {
            setTimeout(() => {
                resolve([mockDaemonInfoIdle]);
            }, 1000);
        });

        sinon.stub(vscode.workspace, "workspaceFolders").value([mockWorkspaceFolder1]);

        const getDaemonsStatusListStub = sinon
            .stub(GradleStatus, "getDaemonsStatusList")
            .withArgs(mockWorkspaceFolder2.uri.fsPath)
            .resolves([mockDaemonInfoIdle]);

        let callCount = 0;
        getDaemonsStatusListStub.withArgs(mockWorkspaceFolder1.uri.fsPath).callsFake(async () => {
            callCount++;
            if (callCount === 1) {
                return quickReply;
            } else {
                return longReply;
            }
        });

        const children = await gradleDaemonsTreeDataProvider.getChildren();

        assert.strictEqual(children[0].description, "BUSY");

        gradleDaemonsTreeDataProvider.refresh();
        await sleep(1000);

        const refreshedChildren = await gradleDaemonsTreeDataProvider.getChildren();

        assert.strictEqual(refreshedChildren[0].description, "IDLE");
    });

    it("should correctly parse daemonInfos from input with Unix and Windows line endings", () => {
        // Windows-style input with \r\n
        const windowsOutput = `
        95141 IDLE     8.6\r\n
        12345 BUSY     7.5\r\n
        67890 STOPPED  (by user or operating system)\r\n
        malformed line\r\n
        `;

        const windowsDaemonInfos = GradleStatus.parseDaemonInfo(windowsOutput);

        assert.strictEqual(
            windowsDaemonInfos.length,
            3,
            "There should be 3 daemons parsed, ignoring malformed lines (Windows)"
        );

        const windowsDaemon1 = windowsDaemonInfos[0];
        assert.strictEqual(windowsDaemon1.getPid(), "95141");
        assert.strictEqual(windowsDaemon1.getStatus(), DaemonStatus.IDLE);
        assert.strictEqual(windowsDaemon1.getInfo(), "8.6");

        const windowsDaemon2 = windowsDaemonInfos[1];
        assert.strictEqual(windowsDaemon2.getPid(), "12345");
        assert.strictEqual(windowsDaemon2.getStatus(), DaemonStatus.BUSY);
        assert.strictEqual(windowsDaemon2.getInfo(), "7.5");

        const windowsDaemon3 = windowsDaemonInfos[2];
        assert.strictEqual(windowsDaemon3.getPid(), "67890");
        assert.strictEqual(windowsDaemon3.getStatus(), DaemonStatus.STOPPED);
        assert.strictEqual(windowsDaemon3.getInfo(), "(by user or operating system)");

        // Unix/Mac-style input with \n
        const unixOutput = `
        95141 IDLE     8.6\n
        12345 BUSY     7.5\n
        67890 STOPPED  (by user or operating system)\n
        malformed line\n
        `;

        const unixDaemonInfos = GradleStatus.parseDaemonInfo(unixOutput);

        assert.strictEqual(
            unixDaemonInfos.length,
            3,
            "There should be 3 daemons parsed, ignoring malformed lines (Unix/Mac)"
        );

        const unixDaemon1 = unixDaemonInfos[0];
        assert.strictEqual(unixDaemon1.getPid(), "95141");
        assert.strictEqual(unixDaemon1.getStatus(), DaemonStatus.IDLE);
        assert.strictEqual(unixDaemon1.getInfo(), "8.6");

        const unixDaemon2 = unixDaemonInfos[1];
        assert.strictEqual(unixDaemon2.getPid(), "12345");
        assert.strictEqual(unixDaemon2.getStatus(), DaemonStatus.BUSY);
        assert.strictEqual(unixDaemon2.getInfo(), "7.5");

        const unixDaemon3 = unixDaemonInfos[2];
        assert.strictEqual(unixDaemon3.getPid(), "67890");
        assert.strictEqual(unixDaemon3.getStatus(), DaemonStatus.STOPPED);
        assert.strictEqual(unixDaemon3.getInfo(), "(by user or operating system)");

        const emptyOutput = "";
        const emptyDaemonInfos = GradleStatus.parseDaemonInfo(emptyOutput);
        assert.strictEqual(emptyDaemonInfos.length, 0, "There should be no daemons parsed for empty output");
    });
});
