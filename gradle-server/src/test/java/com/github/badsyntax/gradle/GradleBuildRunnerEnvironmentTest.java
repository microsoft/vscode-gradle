package com.github.badsyntax.gradle;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.Map;
import org.junit.jupiter.api.Test;

public class GradleBuildRunnerEnvironmentTest {

	@Test
	void noToolOptionsAndNoEnvironmentKeepsTheDefaultEnvironment() {
		assertNull(GradleBuildRunner.buildEnvVars("", Map.of()));
		assertNull(GradleBuildRunner.buildEnvVars(null, null));
	}

	@Test
	void environmentIsAddedToTheEnvironmentOfTheServerProcess() {
		Map<String, String> envVars = GradleBuildRunner.buildEnvVars("",
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
	void toolOptionsWinOverTheGivenEnvironment() {
		Map<String, String> envVars = GradleBuildRunner.buildEnvVars("-Dtool=1",
				Map.of("JAVA_TOOL_OPTIONS", "-Dother=2", "MY_VAR", "1"));

		assertEquals("-Dtool=1", envVars.get("JAVA_TOOL_OPTIONS"));
		assertEquals("1", envVars.get("MY_VAR"));
	}

	@Test
	void toolOptionsAloneStillWork() {
		assertEquals("-Dtool=1", GradleBuildRunner.buildEnvVars("-Dtool=1", Map.of()).get("JAVA_TOOL_OPTIONS"));
	}

}
