package com.github.badsyntax.gradle;

import static org.junit.Assert.assertEquals;

import org.gradle.tooling.GradleConnector;
import org.junit.Test;

public class GradleToolingApiVersionTest {
	@Test
	public void fallbackVersionMatchesResolvedToolingApiDependency() {
		assertEquals("9.8.1", GradleProjectConnector.TOOLING_API_VERSION);
		assertEquals(GradleProjectConnector.TOOLING_API_VERSION,
				GradleConnector.class.getPackage().getImplementationVersion());
	}
}
