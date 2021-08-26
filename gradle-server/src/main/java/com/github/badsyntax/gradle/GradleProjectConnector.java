package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.exceptions.GradleConnectionException;
import com.google.common.base.Strings;
import java.io.File;
import java.nio.file.Paths;
import org.gradle.tooling.GradleConnector;

public class GradleProjectConnector {

  private GradleProjectConnector() {}

  private static GradleProjectConnectionType connectionType = GradleProjectConnectionType.WRAPPER;
  private static String localInstallation;

  public static GradleConnector build(String projectDir, GradleConfig config)
      throws GradleConnectionException {
    GradleConnector connector =
        GradleConnector.newConnector().forProjectDirectory(new File(projectDir));
    setConnectorConfig(connector, projectDir, config);
    return connector;
  }

  private static void setConnectorConfig(
      GradleConnector gradleConnector, String projectDir, GradleConfig config)
      throws GradleConnectionException {
    if (!Strings.isNullOrEmpty(config.getUserHome())) {
      gradleConnector.useGradleUserHomeDir(
          buildGradleUserHomeFile(config.getUserHome(), projectDir));
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
        throw new GradleConnectionException(
            "java.import.gradle.home is invalid, please check it again.");
      }
    } else {
      GradleProjectConnector.connectionType = GradleProjectConnectionType.WRAPPER;
    }
  }

  private static File buildGradleUserHomeFile(String gradleUserHome, String projectDir) {
    String gradleUserHomePath =
        Paths.get(gradleUserHome).isAbsolute()
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
}
