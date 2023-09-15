package com.microsoft.gradle.bs.importer;

import ch.epfl.scala.bsp4j.BuildServer;
import ch.epfl.scala.bsp4j.JavaBuildServer;

public interface BuildServerConnection extends BuildServer, JavaBuildServer {}
