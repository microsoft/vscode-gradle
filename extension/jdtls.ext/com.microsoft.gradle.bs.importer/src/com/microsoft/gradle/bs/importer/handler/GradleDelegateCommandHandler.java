package com.microsoft.gradle.bs.importer.handler;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.Collections;
import java.util.LinkedList;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;
import org.eclipse.jdt.ls.core.internal.JSONUtility;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;

import com.microsoft.gradle.bs.importer.BuildServerConnection;
import com.microsoft.gradle.bs.importer.ImporterPlugin;
import com.microsoft.gradle.bs.importer.Utils;

import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.BuildTargetIdentifier;
import ch.epfl.scala.bsp4j.BuildTargetTag;
import ch.epfl.scala.bsp4j.ScalaTestSuiteSelection;
import ch.epfl.scala.bsp4j.ScalaTestSuites;
import ch.epfl.scala.bsp4j.TestParams;

public class GradleDelegateCommandHandler implements IDelegateCommandHandler {

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) throws Exception {
        switch (commandId) {
            case "java.gradle.delegateTest":
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
                    // The build server only allows to accept one build target per test request. At client side,
                    // each test request is sent per project, so even multiple build targets are found, they
                    // belongs to the same project. Thus, we only use the first one here. Build server will use
                    // this single build target to locate the project to test.
                    btIds = btIds.subList(0, 1);
                }
                TestParams testParams = new TestParams(btIds);
                testParams.setDataKind("scala-test-suites-selection");
                testParams.setArguments(getArguments(arguments));
                List<ScalaTestSuiteSelection> testSelections = new LinkedList<>();
                for (Map.Entry<String, List<String>> entry : tests.entrySet()) {
                    ScalaTestSuiteSelection testSelection = new ScalaTestSuiteSelection(
                        entry.getKey(),
                        entry.getValue()
                    );
                    testSelections.add(testSelection);
                }
                ScalaTestSuites scalaTestSuites = new ScalaTestSuites(
                    testSelections,
                    getJvmOptions(arguments),
                    getEnvVarPairs(arguments)
                );
                testParams.setData(scalaTestSuites);
                buildServerConnection.buildTargetTest(testParams);
                return null;
            default:
                break;
        }
        throw new UnsupportedOperationException("The command: " + commandId + "is not supported.");
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
