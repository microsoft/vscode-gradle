package com.microsoft.gradle.bs.importer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

public class UtilsTest {

  @Test
  public void getJarFileReturnsJarArtifact() throws Exception {
    Path jar = Files.createTempFile("artifact", ".jar");

    assertEquals(jar.toFile(), Utils.getJarFile(jar.toFile()));
  }

  @Test
  public void getJarFileReturnsDirectoryArtifact() throws Exception {
    Path classesDir = Files.createTempDirectory("classes");

    assertEquals(classesDir.toFile(), Utils.getJarFile(classesDir.toFile()));
  }

  @Test
  public void getJarFileSkipsPomArtifact() throws Exception {
    File pom = Files.createTempFile("artifact", ".pom").toFile();

    assertNull(Utils.getJarFile(pom));
  }
}
