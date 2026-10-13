package com.microsoft.gradle.bs.importer.handler;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.stream.Collectors;
import java.util.Collections;
import java.util.LinkedList;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;
import org.eclipse.jdt.ls.core.internal.JSONUtility;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.lsp4j.ExecuteCommandParams;
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException;

import com.microsoft.gradle.bs.importer.BuildServerConnection;
import com.microsoft.gradle.bs.importer.ImporterPlugin;
import com.microsoft.gradle.bs.importer.Utils;

import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.BuildTargetIdentifier;
import ch.epfl.scala.bsp4j.BuildTargetTag;
import ch.epfl.scala.bsp4j.ScalaTestSuiteSelection;
import ch.epfl.scala.bsp4j.ScalaTestSuites;
import ch.epfl.scala.bsp4j.TestParams;
import ch.epfl.scala.bsp4j.TestResult;

public class GradleDelegateCommandHandler implements IDelegateCommandHandler {

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) throws Exception {
        switch (commandId) {
            case "java.gradle.delegateTest":
                String initScriptPath = arguments.size() > 5 ? (String) arguments.get(5) : null;
                CompletableFuture<TestResult> testRequest;
                try {
                    testRequest = delegateTest(arguments);
                } catch (Exception error) {
                    notifyTestRequestComplete(initScriptPath);
                    throw error;
                }
                // Submission returns immediately so the extension can attach the
                // debugger. Only the BSP response releases the per-request script.
                testRequest.whenComplete((result, error) -> {
                    Throwable cause = error;
                    while (cause instanceof CompletionException && cause.getCause() != null) {
                        cause = cause.getCause();
                    }
                    if (initScriptPath != null && cause != null && !(cause instanceof ResponseErrorException)) {
                        // A lost connection or locally cancelled future does not
                        // prove the Gradle build stopped using the script.
                        JavaLanguageServerPlugin.logException(
                            "BSP test completion was not confirmed; retaining init script " + initScriptPath, cause);
                        return;
                    }
                    notifyTestRequestComplete(initScriptPath);
                });
                return null;
            default:
                break;
        }
        throw new UnsupportedOperationException("The command: " + commandId + "is not supported.");
    }

    private CompletableFuture<TestResult> delegateTest(List<Object> arguments) throws Exception {
        String projectName = (String) arguments.get(0);
        Map<String, List<String>> tests = JSONUtility.toModel(arguments.get(1), Map.class);
        IProject project = ProjectUtils.getProject(projectName);
        if (project == null) {
            throw new IllegalArgumentException("Project not found: " + projectName);
        }
        if (!Utils.isGradleBuildServerProject(project)) {
            throw new IllegalArgumentException("Project is not a Gradle build server project: " + projectName);
        }
        IPath rootPath = ProjectUtils.findBelongedWorkspaceRoot(project.getLocation());
        BuildServerConnection buildServerConnection = ImporterPlugin.getBuildServerConnection(rootPath, false);
        if (buildServerConnection == null) {
            throw new IllegalStateException("Build server connection not found for project: " + projectName);
        }
        List<BuildTarget> targets = Utils.getBuildTargetsByProjectUri(buildServerConnection, project.getLocationURI());
        List<BuildTargetIdentifier> btIds = targets.stream().filter(bt -> {
            return bt.getTags().contains(BuildTargetTag.INTEGRATION_TEST) || bt.getTags().contains(BuildTargetTag.TEST);
        }).map(BuildTarget::getId).collect(Collectors.toList());
        if (btIds.isEmpty()) {
            throw new IllegalStateException("Invalid number of build targets: " + btIds.size());
        }

        if (btIds.size() > 1) {
            // The build server accepts one target per request, and all targets
            // here belong to the same project.
            btIds = btIds.subList(0, 1);
        }
        TestParams testParams = new TestParams(btIds);
        testParams.setDataKind("scala-test-suites-selection");
        testParams.setArguments(getArguments(arguments));
        List<ScalaTestSuiteSelection> testSelections = new LinkedList<>();
        for (Map.Entry<String, List<String>> entry : tests.entrySet()) {
            testSelections.add(new ScalaTestSuiteSelection(entry.getKey(), entry.getValue()));
        }
        testParams.setData(new ScalaTestSuites(testSelections, getJvmOptions(arguments), getEnvVarPairs(arguments)));
        return buildServerConnection.buildTargetTest(testParams);
    }

    private void notifyTestRequestComplete(String initScriptPath) {
        if (initScriptPath != null) {
            JavaLanguageServerPlugin.getProjectsManager().getConnection().sendNotification(
                new ExecuteCommandParams("java.gradle.buildServer.onDidCompleteTestRequest",
                    Collections.singletonList(initScriptPath)));
        }
    }

    private List<String> getArguments(List<Object> arguments) {
        if (arguments.size() < 3) {
            return Collections.emptyList();
        }
        return (List<String>) arguments.get(2);
    }

    private List<String> getJvmOptions(List<Object> arguments) {
        if (arguments.size() < 4) {
            return Collections.emptyList();
        }
        return (List<String>) arguments.get(3);
    }

    /**
     * Return a list of environment variable pairs with format KEY=VALUE.
     * TODO: the env var in ScalaTestSuites is deprecated.
     * @param arguments
     * @return
     */
    private List<String> getEnvVarPairs(List<Object> arguments) {
        if (arguments.size() < 5 || arguments.get(4) == null) {
            return Collections.emptyList();
        }
        Map<String, String> envVars = JSONUtility.toModel(arguments.get(4), Map.class);
        return envVars.entrySet().stream().map(entry -> entry.getKey() + "=" + entry.getValue()).collect(Collectors.toList());
    }

}
