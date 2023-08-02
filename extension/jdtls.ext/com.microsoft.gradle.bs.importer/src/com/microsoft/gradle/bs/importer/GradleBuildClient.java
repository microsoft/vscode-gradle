package com.microsoft.gradle.bs.importer;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Objects;

import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;

import ch.epfl.scala.bsp4j.BuildClient;
import ch.epfl.scala.bsp4j.DidChangeBuildTarget;
import ch.epfl.scala.bsp4j.LogMessageParams;
import ch.epfl.scala.bsp4j.PublishDiagnosticsParams;
import ch.epfl.scala.bsp4j.ShowMessageParams;
import ch.epfl.scala.bsp4j.TaskDataKind;
import ch.epfl.scala.bsp4j.TaskFinishParams;
import ch.epfl.scala.bsp4j.TaskProgressParams;
import ch.epfl.scala.bsp4j.TaskStartParams;

public class GradleBuildClient implements BuildClient {

    private static final String CLIENT_APPEND_BUILD_LOG_CMD = "_java.gradle.buildServer.appendBuildLog";

    @Override
    public void onBuildLogMessage(LogMessageParams arg0) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'onBuildLogMessage'");
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
            JavaLanguageServerPlugin.getInstance().getClientConnection().sendNotification(
                    CLIENT_APPEND_BUILD_LOG_CMD, Arrays.asList(msg));
        }
    }

    @Override
    public void onBuildTaskProgress(TaskProgressParams params) {
        if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_TASK)) {
            JavaLanguageServerPlugin.getInstance().getClientConnection().sendNotification(
                    CLIENT_APPEND_BUILD_LOG_CMD, Arrays.asList(params.getMessage()));
        }
    }

    @Override
    public void onBuildTaskFinish(TaskFinishParams params) {
        if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_REPORT)) {
            String msg = params.getMessage() + "\n------\n";
            JavaLanguageServerPlugin.getInstance().getClientConnection().sendNotification(
                    CLIENT_APPEND_BUILD_LOG_CMD, Arrays.asList(msg));
        }
    }
}
