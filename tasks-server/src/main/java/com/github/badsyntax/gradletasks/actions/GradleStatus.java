package com.github.badsyntax.gradletasks.actions;

import com.github.badsyntax.gradletasks.DaemonInfo;
import com.github.badsyntax.gradletasks.ErrorMessageBuilder;
import com.github.badsyntax.gradletasks.GetStatusReply;
import com.github.badsyntax.gradletasks.GetStatusRequest;
import com.github.badsyntax.gradletasks.cancellation.CancellationHandler;
import com.google.common.base.Strings;
import io.grpc.stub.StreamObserver;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.events.OperationType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GradleStatus {
  private static final Logger logger = LoggerFactory.getLogger(GradleStatus.class.getName());

  private GetStatusRequest req;
  private StreamObserver<GetStatusReply> responseObserver;
  private GradleConnector gradleConnector;

  public GradleStatus(
      GetStatusRequest req,
      StreamObserver<GetStatusReply> responseObserver,
      GradleConnector gradleConnector) {
    this.req = req;
    this.responseObserver = responseObserver;
    this.gradleConnector = gradleConnector;
  }

  public static String getCancellationKey(String projectDir, String task) {
    return projectDir + task;
  }

  public String getCancellationKey() {
    return GradleStatus.getCancellationKey(req.getProjectDir(), "status");
  }

  public void run() {
    ArrayList<DaemonInfo> info = new ArrayList<>();
    try {
      File workingDir = new File(req.getProjectDir());
      String command[] = {"./gradlew", "--status"};
      Process process = Runtime.getRuntime().exec(command, null, workingDir);
      // BufferedReader stdErr = new BufferedReader(new
      // InputStreamReader(process.getErrorStream()));
      BufferedReader stdOut = new BufferedReader(new InputStreamReader(process.getInputStream()));

      // int exitValue = process.exitValue();

      String line;
      while ((line = stdOut.readLine()) != null) {
        System.out.println(line);
      }
      stdOut.close();
      // stdErr.close();
    } catch (IOException e1) {
      // TODO Auto-generated catch block
      e1.printStackTrace();
    }

    // try (ProjectConnection connection = gradleConnector.connect()) {
    //   getStatus(connection);
    //   // replyWithSuccess();
    //   responseObserver.onCompleted();
    // } catch (BuildCancelledException e) {
    //   // replyWithCancelled(e);
    //   responseObserver.onCompleted();
    // } catch (BuildException
    //     | UnsupportedVersionException
    //     | UnsupportedBuildArgumentException
    //     | IllegalStateException e) {
    //   logger.error(e.getMessage());
    //   replyWithError(e);
    // } finally {
    //   CancellationHandler.clearRunTaskToken(getCancellationKey());
    // }
  }

  public void getStatus(ProjectConnection connection) {
    Set<OperationType> progressEvents = new HashSet<>();
    progressEvents.add(OperationType.PROJECT_CONFIGURATION);
    progressEvents.add(OperationType.TASK);
    progressEvents.add(OperationType.TRANSFORM);

    // ProgressListener progressListener =
    //     (ProgressEvent event) -> {
    //       synchronized (GradleStatus.class) {
    //         replyWithProgress(event);
    //       }
    //     };

    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

    BuildLauncher build =
        connection
            .newBuild()
            .withCancellationToken(
                CancellationHandler.getRunTaskCancellationToken(getCancellationKey()))
            // .addProgressListener(progressListener, progressEvents)
            .setStandardOutput(outputStream)
            // .setStandardError(
            //     new ByteBufferOutputStream() {
            //       @Override
            //       public void onFlush(byte[] bytes) {
            //         synchronized (GradleStatus.class) {
            //           replyWithStandardError(bytes);
            //         }
            //       }
            //     })
            .forTasks("")
            .withArguments("--status");

    if (!Strings.isNullOrEmpty(req.getGradleConfig().getJvmArguments())) {
      build.setJvmArguments(req.getGradleConfig().getJvmArguments());
    }

    build.run();

    System.out.println("foo");
  }

  // public void replyWithCancelled(BuildCancelledException e) {
  //   responseObserver.onNext(
  //       GetStatusReply.newBuilder()
  //           .setCancelled(
  //               Cancelled.newBuilder()
  //                   .setMessage(e.getMessage())
  //                   .setProjectDir(req.getProjectDir()))
  //           .build());
  // }

  public void replyWithError(Exception e) {
    responseObserver.onError(ErrorMessageBuilder.build(e));
  }

  // public void replyWithSuccess() {
  //   responseObserver.onNext(
  //       GetStatusReply.newBuilder()
  //           .setRunTaskResult(
  //               RunTaskResult.newBuilder()
  //                   .setMessage("Successfully run task")
  //                   .setTask(req.getTask()))
  //           .build());
  // }

  // private void replyWithProgress(ProgressEvent progressEvent) {
  //   responseObserver.onNext(
  //       GetStatusReply.newBuilder()
  //           .setProgress(Progress.newBuilder().setMessage(progressEvent.getDisplayName()))
  //           .build());
  // }

  // private void replyWithStandardOutput(byte[] bytes) {
  //   ByteString byteString = ByteString.copyFrom(bytes);
  //   responseObserver.onNext(
  //       GetStatusReply.newBuilder()
  //           .setOutput(
  //               Output.newBuilder()
  //                   .setOutputType(Output.OutputType.STDOUT)
  //                   .setOutputBytes(byteString))
  //           .build());
  // }

  // private void replyWithStandardError(byte[] bytes) {
  //   ByteString byteString = ByteString.copyFrom(bytes);
  //   responseObserver.onNext(
  //       GetStatusReply.newBuilder()
  //           .setOutput(
  //               Output.newBuilder()
  //                   .setOutputType(Output.OutputType.STDERR)
  //                   .setOutputBytes(byteString))
  //           .build());
  // }
}
