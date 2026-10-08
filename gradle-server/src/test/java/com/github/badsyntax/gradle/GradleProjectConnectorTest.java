package com.github.badsyntax.gradle;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.powermock.api.mockito.PowerMockito.mockStatic;
import static org.powermock.api.mockito.PowerMockito.when;

import java.io.File;
import org.gradle.tooling.GradleConnector;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.powermock.core.classloader.annotations.PrepareForTest;
import org.powermock.modules.junit4.PowerMockRunner;

@RunWith(PowerMockRunner.class)
@PrepareForTest({GradleConnector.class, GradleProjectConnector.class})
public class GradleProjectConnectorTest {
	private final File projectDir = new File("project");
	private GradleConnector connector;

	@Before
	public void setUp() {
		connector = mock(GradleConnector.class);
		mockStatic(GradleConnector.class);
		when(GradleConnector.newConnector()).thenReturn(connector);
		when(connector.forProjectDirectory(projectDir)).thenReturn(connector);
		mockStatic(GradleProjectConnector.class, CALLS_REAL_METHODS);
		when(GradleProjectConnector.getSystemGradleHome()).thenReturn(new File("system-gradle"));
	}

	@Test
	public void wrapperTakesPrecedenceOverExplicitVersionAndInstallations() {
		GradleProjectConnector.build(projectDir.toString(), GradleConfig.newBuilder().setWrapperEnabled(true)
				.setVersion("8.5").setGradleHome("configured-gradle").build());
		verify(connector, never()).useGradleVersion(anyString());
		verify(connector, never()).useInstallation(any(File.class));
		assertEquals(GradleProjectConnectionType.WRAPPER, GradleProjectConnector.getConnectionType());
	}

	@Test
	public void explicitVersionTakesPrecedenceOverInstallations() {
		GradleProjectConnector.build(projectDir.toString(), GradleConfig.newBuilder().setWrapperEnabled(false)
				.setVersion("8.5").setGradleHome("configured-gradle").build());
		verify(connector).useGradleVersion("8.5");
		verify(connector, never()).useInstallation(any(File.class));
	}

	@Test
	public void configuredInstallationTakesPrecedenceOverSystemInstallation() {
		GradleProjectConnector.build(projectDir.toString(),
				GradleConfig.newBuilder().setWrapperEnabled(false).setGradleHome("configured-gradle").build());
		verify(connector).useInstallation(new File("configured-gradle"));
		verify(connector, never()).useGradleVersion(anyString());
	}

	@Test
	public void systemInstallationTakesPrecedenceOverFallback() {
		GradleProjectConnector.build(projectDir.toString(), GradleConfig.newBuilder().setWrapperEnabled(false).build());
		verify(connector).useInstallation(new File("system-gradle"));
		verify(connector, never()).useGradleVersion(anyString());
	}

	@Test
	public void fallbackUsesGradle981WhenNoInstallationIsConfigured() {
		when(GradleProjectConnector.getSystemGradleHome()).thenReturn(null);
		GradleProjectConnector.build(projectDir.toString(), GradleConfig.newBuilder().setWrapperEnabled(false).build());
		verify(connector).useGradleVersion("9.8.1");
		verify(connector, never()).useInstallation(any(File.class));
	}
}
