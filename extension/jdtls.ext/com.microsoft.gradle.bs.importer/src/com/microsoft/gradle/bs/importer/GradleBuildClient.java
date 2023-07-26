package com.microsoft.gradle.bs.importer;

import ch.epfl.scala.bsp4j.BuildClient;
import ch.epfl.scala.bsp4j.DidChangeBuildTarget;
import ch.epfl.scala.bsp4j.LogMessageParams;
import ch.epfl.scala.bsp4j.PublishDiagnosticsParams;
import ch.epfl.scala.bsp4j.ShowMessageParams;
import ch.epfl.scala.bsp4j.TaskFinishParams;
import ch.epfl.scala.bsp4j.TaskProgressParams;
import ch.epfl.scala.bsp4j.TaskStartParams;

public class GradleBuildClient implements BuildClient {

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
    public void onBuildTaskFinish(TaskFinishParams arg0) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'onBuildTaskFinish'");
    }

    @Override
    public void onBuildTaskProgress(TaskProgressParams arg0) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'onBuildTaskProgress'");
    }

    @Override
    public void onBuildTaskStart(TaskStartParams arg0) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'onBuildTaskStart'");
    }

}
