package com.microsoft.gradle.bs.importer;

import java.net.URI;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.lsp4j.ExecuteCommandParams;
import org.eclipse.lsp4j.ProgressParams;
import org.eclipse.lsp4j.WorkDoneProgressBegin;
import org.eclipse.lsp4j.WorkDoneProgressCreateParams;
import org.eclipse.lsp4j.WorkDoneProgressEnd;
import org.eclipse.lsp4j.WorkDoneProgressReport;
import org.eclipse.lsp4j.jsonrpc.messages.Either;

import com.microsoft.gradle.bs.importer.model.JavaTestStatus;

import org.eclipse.jdt.ls.core.internal.JSONUtility;
import org.eclipse.jdt.ls.core.internal.JavaClientConnection.JavaLanguageClient;

import ch.epfl.scala.bsp4j.BuildClient;
import ch.epfl.scala.bsp4j.BuildTargetEvent;
import ch.epfl.scala.bsp4j.BuildTargetIdentifier;
import ch.epfl.scala.bsp4j.DidChangeBuildTarget;
import ch.epfl.scala.bsp4j.LogMessageParams;
import ch.epfl.scala.bsp4j.MessageType;
import ch.epfl.scala.bsp4j.PublishDiagnosticsParams;
import ch.epfl.scala.bsp4j.ShowMessageParams;
import ch.epfl.scala.bsp4j.StatusCode;
import ch.epfl.scala.bsp4j.TaskDataKind;
import ch.epfl.scala.bsp4j.TaskFinishParams;
import ch.epfl.scala.bsp4j.TaskProgressParams;
import ch.epfl.scala.bsp4j.TaskStartParams;
import ch.epfl.scala.bsp4j.extended.TestFinishEx;
import ch.epfl.scala.bsp4j.extended.TestName;
import ch.epfl.scala.bsp4j.extended.TestStartEx;

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

    private final JavaLanguageClient lsClient;

    private final LruCache<String> failedTaskCache = new LruCache<>(16);

    public GradleBuildClient() {
        this.lsClient = JavaLanguageServerPlugin.getProjectsManager().getConnection();
    }

    @Override
    public void onBuildLogMessage(LogMessageParams params) {
        MessageType type = params.getType();
        if (type == MessageType.LOG) {
            Utils.sendTelemetry(this.lsClient, params.getMessage());
        } else {
            String command = CLIENT_BUILD_LOG_CMD;
            if (type == MessageType.ERROR && failedTaskCache.contains(params.getTask().getId())) {
                // append the compilation failure message to the build output channel.
                command = CLIENT_APPEND_BUILD_LOG_CMD;
            }
            this.lsClient.sendNotification(new ExecuteCommandParams(command, Arrays.asList(params.getMessage())));
        }
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
    public void onBuildTargetDidChange(DidChangeBuildTarget params) {
        Set<IProject> projects = new HashSet<>();
        for (BuildTargetEvent event : params.getChanges()) {
            BuildTargetIdentifier id = event.getTarget();
            URI uri = Utils.getUriWithoutQuery(id.getUri());
            IProject project = ProjectUtils.getProjectFromUri(uri.toString());
            if (project != null) {
                projects.add(project);
            }
        }

        if (projects.isEmpty()) {
            return;
        }

        // Update projects in a new thread to avoid blocking the IO queue,
        // since some BSP requests will be sent during project updates.
        CompletableFuture.runAsync(() -> {
            GradleBuildServerBuildSupport buildSupport = new GradleBuildServerBuildSupport();
            for (IProject project : projects) {
                try {
                    buildSupport.update(project, true, new NullProgressMonitor());
                } catch (CoreException e) {
                    JavaLanguageServerPlugin.log(e);
                }
            }
        });
    }


    @Override
    public void onBuildTaskStart(TaskStartParams params) {
        if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_TASK)) {
            SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            Date now = new Date();
            String msg = "> Build starts at " + dateFormat.format(now) + "\n" + params.getMessage();
            lsClient.sendNotification(new ExecuteCommandParams(CLIENT_APPEND_BUILD_LOG_CMD, Arrays.asList(msg)));
        } else if (Objects.equals(params.getDataKind(), TaskDataKind.TEST_START)) {
            TestStartEx testStartEx = JSONUtility.toModel(params.getData(), TestStartEx.class);
            String displayName = testStartEx.getTestName().getDisplayName();
            if (displayName.matches("(?i)test suite '.+'") || displayName.matches("(?i)test\\s+\\w+\\(.*\\)\\(\\w+(\\.\\w+)*\\)")) {
                // ignore the suite start message as the display name.
                displayName = null;
            }
            List<String> testParts = getTestParts(testStartEx.getTestName());
            lsClient.sendNotification(new ExecuteCommandParams("java.gradle.buildServer.onDidChangeTestItemStatus",
                    Arrays.asList(testParts, 2/*Running status*/, displayName)));
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
            workDoneProgressReport.setMessage(StringUtils.isBlank(params.getMessage()) ? BUILD_SERVER_TASK :
                    BUILD_SERVER_TASK + " - " + params.getMessage());
            lsClient.notifyProgress(new ProgressParams(id, Either.forLeft(workDoneProgressReport)));
        }
    }

    @Override
    public void onBuildTaskFinish(TaskFinishParams params) {
        if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_REPORT)) {
            String msg = params.getMessage() + "\n------\n";
            lsClient.sendNotification(new ExecuteCommandParams(CLIENT_APPEND_BUILD_LOG_CMD, Arrays.asList(msg)));
            if (params.getStatus() == StatusCode.ERROR) {
                failedTaskCache.addAll((params.getTaskId().getParents()));
            }
        } else if (Objects.equals(params.getDataKind(), TaskDataKind.TEST_FINISH)) {
            TestFinishEx testFinishEx = JSONUtility.toModel(params.getData(), TestFinishEx.class);
            List<String> testParts = getTestParts(testFinishEx.getTestName());
            JavaTestStatus testStatus = switch (testFinishEx.getStatus()) {
                case PASSED -> JavaTestStatus.Passed;
                case FAILED -> JavaTestStatus.Failed;
                case IGNORED, CANCELLED, SKIPPED -> JavaTestStatus.Skipped;
                default -> null;
            };
            if (testStatus == null) {
                throw new IllegalArgumentException("Unsupported test status: " + testFinishEx.getStatus());
            }
            lsClient.sendNotification(new ExecuteCommandParams("java.gradle.buildServer.onDidChangeTestItemStatus",
                Arrays.asList(testParts, testStatus.getValue(), null, testFinishEx.getStackTrace()))); // TODO: test duration is missing
        } else if (Objects.equals(params.getDataKind(), TaskDataKind.TEST_REPORT)) {
            lsClient.sendNotification(new ExecuteCommandParams("java.gradle.buildServer.onDidFinishTestRun",
                    Arrays.asList(params.getStatus().getValue(), params.getMessage())));
        } else {
            Either<String, Integer> id = Either.forLeft(params.getTaskId().getId());
            WorkDoneProgressEnd workDoneProgressEnd = new WorkDoneProgressEnd();
            workDoneProgressEnd.setMessage(StringUtils.isBlank(params.getMessage()) ? BUILD_SERVER_TASK :
                    BUILD_SERVER_TASK + " - " + params.getMessage());
            lsClient.notifyProgress(new ProgressParams(id, Either.forLeft(workDoneProgressEnd)));
        }
    }

    /**
     * Currently, the test name returned from gradle build server is started from the class name,
     * then follows the method or invocation name.
     * @return The test identifier parts
     */
    private List<String> getTestParts(TestName testName) {
        List<String> testNames = new LinkedList<>();
        while (testName != null) {
            if (testName.getSuiteName() != null) {
                testNames.add(testName.getSuiteName());
            } else if (testName.getMethodName() != null) {
                testNames.add(testName.getMethodName());
            } else if (testName.getClassName() != null) {
                testNames.add(testName.getClassName());
            }
            testName = testName.getParent();
        }
        Collections.reverse(testNames);

        // eliminate the common prefix when there is nested class test
        // only reserve the last one as the fully qualified name.
        int i = 0;
        for (; i < testNames.size() - 1; i++) {
            String cur = testNames.get(i);
            String next = testNames.get(i + 1);
            if (!next.startsWith(cur + "$")) {
                break;
            }
        }

        return testNames.subList(i, testNames.size());
    }

    private class LruCache<T> extends LinkedHashSet<T> {
        private final int maxSize;

        public LruCache(int maxSize) {
            super(maxSize);
            this.maxSize = maxSize;
        }

        @Override
        public boolean add(T element) {
            if (size() >= maxSize) {
                T oldestElement = iterator().next();
                remove(oldestElement);
            }
            return super.add(element);
        }
    }
}
