package com.microsoft.gradle.bs.importer;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Objects;

import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.lsp4j.ExecuteCommandParams;
import org.eclipse.lsp4j.ProgressParams;
import org.eclipse.lsp4j.WorkDoneProgressBegin;
import org.eclipse.lsp4j.WorkDoneProgressCreateParams;
import org.eclipse.lsp4j.WorkDoneProgressEnd;
import org.eclipse.lsp4j.WorkDoneProgressReport;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.eclipse.jdt.ls.core.internal.JavaClientConnection.JavaLanguageClient;

import ch.epfl.scala.bsp4j.BuildClient;
import ch.epfl.scala.bsp4j.DidChangeBuildTarget;
import ch.epfl.scala.bsp4j.LogMessageParams;
import ch.epfl.scala.bsp4j.MessageType;
import ch.epfl.scala.bsp4j.PublishDiagnosticsParams;
import ch.epfl.scala.bsp4j.ShowMessageParams;
import ch.epfl.scala.bsp4j.TaskDataKind;
import ch.epfl.scala.bsp4j.TaskFinishParams;
import ch.epfl.scala.bsp4j.TaskProgressParams;
import ch.epfl.scala.bsp4j.TaskStartParams;

public class GradleBuildClient implements BuildClient {

    /**
     * The task name for the build server.
     */
    private static final String BUILD_SERVER_TASK = "Build Server Task";

    /**
     * Client command to append build logs to the output channel.
     */
    private static final String CLIENT_APPEND_BUILD_LOG_CMD = "_java.gradle.buildServer.appendBuildLog";

    /**
     * Client command to append event logs to the output channel.
     */
    private static final String CLIENT_BUILD_LOG_CMD = "_java.gradle.buildServer.log";

    /**
     * Client command to send telemetry data to the LS client.
     */
    private static final String CLIENT_BUILD_SEND_TELEMETRY = "_java.gradle.buildServer.sendTelemetry";

    private final JavaLanguageClient lsClient;

    public GradleBuildClient() {
        this.lsClient = JavaLanguageServerPlugin.getProjectsManager().getConnection();
    }

    @Override
    public void onBuildLogMessage(LogMessageParams params) {
        MessageType type = params.getType();
        String cmd = type == MessageType.LOG ? CLIENT_BUILD_SEND_TELEMETRY : CLIENT_BUILD_LOG_CMD;
        this.lsClient.sendNotification(new ExecuteCommandParams(cmd, Arrays.asList(params.getMessage())));
    }

    @Override
    public void onBuildPublishDiagnostics(PublishDiagnosticsParams arg0) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'onBuildPublishDiagnostics'");
    }

    @Override
    public void onBuildShowMessage(ShowMessageParams arg0) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'onBuildShowMessage'");
    }

    @Override
    public void onBuildTargetDidChange(DidChangeBuildTarget arg0) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'onBuildTargetDidChange'");
    }


    @Override
    public void onBuildTaskStart(TaskStartParams params) {
        if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_TASK)) {
            SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            Date now = new Date();
            String msg = "> Build starts at " + dateFormat.format(now) + "\n" + params.getMessage();
            lsClient.sendNotification(new ExecuteCommandParams(CLIENT_APPEND_BUILD_LOG_CMD, Arrays.asList(msg)));
        } else {
            Either<String, Integer> id = Either.forLeft(params.getTaskId().getId());
            lsClient.createProgress(new WorkDoneProgressCreateParams(id));
            WorkDoneProgressBegin workDoneProgressBegin = new WorkDoneProgressBegin();
            workDoneProgressBegin.setTitle(BUILD_SERVER_TASK);
            workDoneProgressBegin.setMessage(params.getMessage());
            lsClient.notifyProgress(new ProgressParams(id, Either.forLeft(workDoneProgressBegin)));
        }
    }

    @Override
    public void onBuildTaskProgress(TaskProgressParams params) {
        if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_TASK)) {
            lsClient.sendNotification(new ExecuteCommandParams(CLIENT_APPEND_BUILD_LOG_CMD,
                    Arrays.asList(params.getMessage())));
        } else {
            Either<String, Integer> id = Either.forLeft(params.getTaskId().getId());
            WorkDoneProgressReport workDoneProgressReport = new WorkDoneProgressReport();
            workDoneProgressReport.setMessage(BUILD_SERVER_TASK + " - " + params.getMessage());
            lsClient.notifyProgress(new ProgressParams(id, Either.forLeft(workDoneProgressReport)));
        }
    }

    @Override
    public void onBuildTaskFinish(TaskFinishParams params) {
        if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_REPORT)) {
            String msg = params.getMessage() + "\n------\n";
            lsClient.sendNotification(new ExecuteCommandParams(CLIENT_APPEND_BUILD_LOG_CMD, Arrays.asList(msg)));
        } else {
            Either<String, Integer> id = Either.forLeft(params.getTaskId().getId());
            WorkDoneProgressEnd workDoneProgressEnd = new WorkDoneProgressEnd();
            workDoneProgressEnd.setMessage(params.getMessage());
            lsClient.notifyProgress(new ProgressParams(id, Either.forLeft(workDoneProgressEnd)));
        }
    }
}
