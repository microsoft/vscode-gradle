package com.github.badsyntax.gradle;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Map;
import org.junit.Test;

public class GradleBuildRunnerEnvironmentTest {

	@Test
	public void noToolOptionsAndNoEnvironmentKeepsTheDefaultEnvironment() {
		assertNull(GradleBuildRunner.buildJavaEnvVarsWithToolOptions("", Map.of()));
		assertNull(GradleBuildRunner.buildJavaEnvVarsWithToolOptions(null, null));
	}

	@Test
	public void environmentIsAddedToTheEnvironmentOfTheServerProcess() {
		Map<String, String> envVars = GradleBuildRunner.buildJavaEnvVarsWithToolOptions("",
				Map.of("JAVA_HOME", "/custom/jdk", "MY_VAR", "1"));

		assertEquals("/custom/jdk", envVars.get("JAVA_HOME"));
		assertEquals("1", envVars.get("MY_VAR"));
		System.getenv().forEach((name, value) -> {
			if (!name.equals("JAVA_HOME")) {
				assertEquals(value, envVars.get(name));
			}
		});
	}

	@Test
	public void environmentOverridesAVariableOfTheServerProcess() {
		// whatever variable the server process has, such that the test does not depend
		// on the machine
		String inherited = System.getenv().keySet().iterator().next();
		Map<String, String> envVars = GradleBuildRunner.buildJavaEnvVarsWithToolOptions("",
				Map.of(inherited, "overridden"));

		assertEquals("overridden", envVars.get(inherited));
	}

	@Test
	public void environmentOverridesAndToolOptionsAreCombined() {
		Map<String, String> envVars = GradleBuildRunner.buildJavaEnvVarsWithToolOptions("-Dtool=1",
				Map.of("JAVA_HOME", "/custom/jdk"));

		assertEquals("/custom/jdk", envVars.get("JAVA_HOME"));
		assertEquals("-Dtool=1", envVars.get("JAVA_TOOL_OPTIONS"));
	}

	@Test
	public void toolOptionsWinOverTheGivenEnvironment() {
		Map<String, String> envVars = GradleBuildRunner.buildJavaEnvVarsWithToolOptions("-Dtool=1",
				Map.of("JAVA_TOOL_OPTIONS", "-Dother=2", "MY_VAR", "1"));

		assertEquals("-Dtool=1", envVars.get("JAVA_TOOL_OPTIONS"));
		assertEquals("1", envVars.get("MY_VAR"));
	}

	@Test
	public void toolOptionsAloneStillWork() {
		assertEquals("-Dtool=1",
				GradleBuildRunner.buildJavaEnvVarsWithToolOptions("-Dtool=1", Map.of()).get("JAVA_TOOL_OPTIONS"));
	}

}
