package com.microsoft.gradle.bs.importer.handler;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.Path;
import org.eclipse.jdt.ls.core.internal.JSONUtility;
import org.eclipse.jdt.ls.core.internal.JavaClientConnection.JavaLanguageClient;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.managers.ProjectsManager;
import org.eclipse.lsp4j.ExecuteCommandParams;
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException;
import org.eclipse.lsp4j.jsonrpc.messages.ResponseError;
import org.eclipse.lsp4j.jsonrpc.messages.ResponseErrorCode;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;

import com.microsoft.gradle.bs.importer.BuildServerConnection;
import com.microsoft.gradle.bs.importer.ImporterPlugin;
import com.microsoft.gradle.bs.importer.Utils;

import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.BuildTargetIdentifier;
import ch.epfl.scala.bsp4j.BuildTargetTag;
import ch.epfl.scala.bsp4j.StatusCode;
import ch.epfl.scala.bsp4j.TestResult;

public class GradleDelegateCommandHandlerTest {
    private final GradleDelegateCommandHandler handler = new GradleDelegateCommandHandler();
    private final BuildServerConnection connection = mock(BuildServerConnection.class);
    private final JavaLanguageClient client = mock(JavaLanguageClient.class);
    private final CompletableFuture<TestResult> request = new CompletableFuture<>();
    private MockedStatic<ProjectUtils> projectUtils;
    private MockedStatic<Utils> utils;
    private MockedStatic<ImporterPlugin> importer;
    private MockedStatic<JavaLanguageServerPlugin> javaPlugin;
    private MockedStatic<JSONUtility> json;

    @Before
    public void setUp() throws Exception {
        projectUtils = mockStatic(ProjectUtils.class);
        utils = mockStatic(Utils.class);
        importer = mockStatic(ImporterPlugin.class);
        javaPlugin = mockStatic(JavaLanguageServerPlugin.class);
        json = mockStatic(JSONUtility.class);

        IProject project = mock(IProject.class);
        IPath root = new Path("test-project");
        when(project.getLocation()).thenReturn(root);
        when(project.getLocationURI()).thenReturn(new File("test-project").toURI());
        projectUtils.when(() -> ProjectUtils.getProject("demo")).thenReturn(project);
        projectUtils.when(() -> ProjectUtils.findBelongedWorkspaceRoot(root)).thenReturn(root);
        utils.when(() -> Utils.isGradleBuildServerProject(project)).thenReturn(true);
        BuildTarget target = mock(BuildTarget.class);
        when(target.getTags()).thenReturn(List.of(BuildTargetTag.TEST));
        when(target.getId()).thenReturn(new BuildTargetIdentifier("test-target"));
        utils.when(() -> Utils.getBuildTargetsByProjectUri(connection, project.getLocationURI()))
            .thenReturn(List.of(target));
        importer.when(() -> ImporterPlugin.getBuildServerConnection(root, false)).thenReturn(connection);
        json.when(() -> JSONUtility.toModel("tests", Map.class))
            .thenReturn(Map.of("com.example.AppTest", List.of("passes")));
        ProjectsManager projectsManager = mock(ProjectsManager.class);
        when(projectsManager.getConnection()).thenReturn(client);
        javaPlugin.when(JavaLanguageServerPlugin::getProjectsManager).thenReturn(projectsManager);
        when(connection.buildTargetTest(any())).thenReturn(request);
    }

    @After
    public void tearDown() {
        json.close();
        javaPlugin.close();
        importer.close();
        utils.close();
        projectUtils.close();
    }

    @Test
    public void submissionReturnsWithoutReleasingTheScript() throws Exception {
        assertNull(submit("init-script"));
        assertFalse(request.isDone());
        verify(client, never()).sendNotification(any());
        request.complete(new TestResult(StatusCode.OK));
        verifyCompletion("init-script");
    }

    @Test
    public void releasesTheScriptOnRemoteFailureBeforeAnyTestReport() throws Exception {
        submit("init-script");
        request.completeExceptionally(new CompletionException(new ResponseErrorException(
            new ResponseError(ResponseErrorCode.InternalError, "Gradle failed", null))));
        verifyCompletion("init-script");
    }

    @Test
    public void releasesTheScriptOnConfirmedServerCancellation() throws Exception {
        submit("init-script");
        request.complete(new TestResult(StatusCode.CANCELLED));
        verifyCompletion("init-script");
    }

    @Test
    public void retainsTheScriptOnConnectionLoss() throws Exception {
        submit("init-script");
        request.completeExceptionally(new IOException("Connection lost"));
        verify(client, never()).sendNotification(any());
    }

    @Test
    public void retainsTheScriptOnLocalFutureCancellation() throws Exception {
        submit("init-script");
        request.cancel(true);
        verify(client, never()).sendNotification(any());
    }

    @Test
    public void releasesTheScriptWhenSubmissionFailsBeforeStartingTheRequest() {
        projectUtils.when(() -> ProjectUtils.getProject("demo")).thenReturn(null);
        assertThrows(IllegalArgumentException.class, () -> submit("init-script"));
        verify(connection, never()).buildTargetTest(any());
        verifyCompletion("init-script");
    }

    @Test
    public void handlesAnAlreadyCompletedRequest() throws Exception {
        request.complete(new TestResult(StatusCode.OK));
        submit("init-script");
        verifyCompletion("init-script");
    }

    @Test
    public void preservesCallersWithoutAnExtensionOwnedScript() throws Exception {
        handler.executeCommand("java.gradle.delegateTest",
            Arrays.asList("demo", "tests", List.of(), List.of(), null), null);
        request.complete(new TestResult(StatusCode.OK));
        verify(client, never()).sendNotification(any());
    }

    @Test
    public void correlatesOverlappingRequestsWithTheirOwnScripts() throws Exception {
        CompletableFuture<TestResult> secondRequest = new CompletableFuture<>();
        when(connection.buildTargetTest(any())).thenReturn(request, secondRequest);
        submit("first-script");
        submit("second-script");
        secondRequest.complete(new TestResult(StatusCode.ERROR));
        verifyCompletion("second-script");
        assertFalse(request.isDone());
    }

    private Object submit(String initScriptPath) throws Exception {
        return handler.executeCommand("java.gradle.delegateTest",
            Arrays.asList("demo", "tests", List.of(), List.of(), null, initScriptPath), null);
    }

    private void verifyCompletion(String initScriptPath) {
        ArgumentCaptor<ExecuteCommandParams> notification = ArgumentCaptor.forClass(ExecuteCommandParams.class);
        verify(client).sendNotification(notification.capture());
        org.junit.Assert.assertEquals("java.gradle.buildServer.onDidCompleteTestRequest",
            notification.getValue().getCommand());
        org.junit.Assert.assertEquals(List.of(initScriptPath), notification.getValue().getArguments());
    }
}
