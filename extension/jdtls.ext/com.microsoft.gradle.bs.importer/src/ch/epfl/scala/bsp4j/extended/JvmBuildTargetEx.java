package ch.epfl.scala.bsp4j.extended;

import java.util.Objects;

import ch.epfl.scala.bsp4j.JvmBuildTarget;

/**
 * Extended {@link JvmBuildTarget}, which contains the Gradle version.
 * The client can use the Gradle version to find compatible JDKs according to
 * https://docs.gradle.org/current/userguide/compatibility.html.
 */
public class JvmBuildTargetEx extends JvmBuildTarget {

  private String gradleVersion;

  public JvmBuildTargetEx(String javaHome, String javaVersion,
      String gradleVersion) {
    super(javaHome, javaVersion);
    this.gradleVersion = gradleVersion;
  }

  public String getGradleVersion() {
    return gradleVersion;
  }

  public void setGradleVersion(String gradleVersion) {
    this.gradleVersion = gradleVersion;
  }

  @Override
  public int hashCode() {
    final int prime = 31;
    int result = super.hashCode();
    result = prime * result + Objects.hash(gradleVersion);
    return result;
  }

  @Override
  public boolean equals(Object obj) {
    if (this == obj) {
      return true;
    }
    if (!super.equals(obj)) {
      return false;
    }
    if (getClass() != obj.getClass()) {
      return false;
    }
    JvmBuildTargetEx other = (JvmBuildTargetEx) obj;
    return Objects.equals(gradleVersion, other.gradleVersion);
  }
}
