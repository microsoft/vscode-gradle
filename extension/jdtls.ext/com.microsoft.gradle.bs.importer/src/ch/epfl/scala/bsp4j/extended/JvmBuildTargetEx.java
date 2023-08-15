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

  private String sourceCompatibility;

  private String targetCompatibility;

  public JvmBuildTargetEx(String javaHome, String javaVersion) {
    super(javaHome, javaVersion);
  }

  /**
   * Create a new instance of {@link JvmBuildTargetEx}.
   */
  public JvmBuildTargetEx(String javaHome, String javaVersion,
      String gradleVersion, String sourceCompatibility, String targetCompatibility) {
    super(javaHome, javaVersion);
    this.gradleVersion = gradleVersion;
    this.sourceCompatibility = sourceCompatibility;
    this.targetCompatibility = targetCompatibility;
  }

  public String getGradleVersion() {
    return gradleVersion;
  }

  public void setGradleVersion(String gradleVersion) {
    this.gradleVersion = gradleVersion;
  }

  public String getSourceCompatibility() {
    return sourceCompatibility;
  }

  public void setSourceCompatibility(String sourceCompatibility) {
    this.sourceCompatibility = sourceCompatibility;
  }

  public String getTargetCompatibility() {
    return targetCompatibility;
  }

  public void setTargetCompatibility(String targetCompatibility) {
    this.targetCompatibility = targetCompatibility;
  }

  @Override
  public int hashCode() {
    final int prime = 31;
    int result = super.hashCode();
    result = prime * result + Objects.hash(gradleVersion, sourceCompatibility,
        targetCompatibility);
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
    return Objects.equals(gradleVersion, other.gradleVersion)
        && Objects.equals(sourceCompatibility, other.sourceCompatibility)
        && Objects.equals(targetCompatibility, other.targetCompatibility);
  }
}
