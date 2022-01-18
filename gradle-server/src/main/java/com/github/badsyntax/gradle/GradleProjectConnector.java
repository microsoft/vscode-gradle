package com.github.badsyntax.gradle;

import com.google.common.base.Strings;
import java.io.File;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Properties;
import org.gradle.tooling.GradleConnector;

public class GradleProjectConnector {

	private GradleProjectConnector() {
	}

	private static final String GRADLE_HOME = "GRADLE_HOME";
	public static final String TOOLING_API_VERSION = "6.4";

	private static GradleProjectConnectionType connectionType = GradleProjectConnectionType.WRAPPER;
	private static String localInstallation;

	public static GradleConnector build(String projectDir, GradleConfig config) {
		GradleConnector connector = GradleConnector.newConnector().forProjectDirectory(new File(projectDir));
		setConnectorConfig(connector, projectDir, config);
		return connector;
	}

	private static void setConnectorConfig(GradleConnector gradleConnector, String projectDir, GradleConfig config) {
		if (!Strings.isNullOrEmpty(config.getUserHome())) {
			gradleConnector.useGradleUserHomeDir(buildGradleUserHomeFile(config.getUserHome(), projectDir));
		}
		if (!config.getWrapperEnabled()) {
			if (!Strings.isNullOrEmpty(config.getVersion())) {
				GradleProjectConnector.connectionType = GradleProjectConnectionType.SPECIFICVERSION;
				gradleConnector.useGradleVersion(config.getVersion());
			} else if (!Strings.isNullOrEmpty(config.getGradleHome())) {
				GradleProjectConnector.connectionType = GradleProjectConnectionType.LOCALINSTALLATION;
				GradleProjectConnector.localInstallation = config.getGradleHome();
				gradleConnector.useInstallation(new File(GradleProjectConnector.localInstallation));
			} else {
				File gradleHomeFile = getSystemGradleHome();
				if (gradleHomeFile != null) {
					GradleProjectConnector.connectionType = GradleProjectConnectionType.LOCALINSTALLATION;
					GradleProjectConnector.localInstallation = gradleHomeFile.toString();
					gradleConnector.useInstallation(gradleHomeFile);
					return;
				}
				// use tooling api version as fallback
				GradleProjectConnector.connectionType = GradleProjectConnectionType.SPECIFICVERSION;
				gradleConnector.useGradleVersion(TOOLING_API_VERSION);
			}
		} else {
			GradleProjectConnector.connectionType = GradleProjectConnectionType.WRAPPER;
		}
	}

	private static File buildGradleUserHomeFile(String gradleUserHome, String projectDir) {
		String gradleUserHomePath = Paths.get(gradleUserHome).isAbsolute()
				? gradleUserHome
				: Paths.get(projectDir, gradleUserHome).toAbsolutePath().toString();
		return new File(gradleUserHomePath);
	}

	public static GradleProjectConnectionType getConnectionType() {
		return GradleProjectConnector.connectionType;
	}

	public static String getLocalInstallation() {
		return GradleProjectConnector.localInstallation;
	}

	public static File getSystemGradleHome() {
		Map<String, String> env = System.getenv();
		Properties sysProperties = System.getProperties();
		String gradleHome = env.get(GRADLE_HOME);
		if (gradleHome == null) {
			gradleHome = sysProperties.getProperty(GRADLE_HOME);
		}
		return (gradleHome == null) ? null : new File(gradleHome);
	}
}
