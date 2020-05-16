/*
 * Copyright 2011 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package task.metadata;

import java.io.File;
import javax.annotation.Nullable;
import org.gradle.tooling.model.DomainObjectSet;
import org.gradle.tooling.model.GradleTask;
import org.gradle.tooling.model.HierarchicalElement;
import org.gradle.tooling.model.ProjectIdentifier;
import org.gradle.tooling.model.ProjectModel;
import org.gradle.tooling.model.UnsupportedMethodException;
import org.gradle.tooling.model.gradle.GradleScript;

/**
 * Represents a Gradle project.
 *
 * @since 1.0-milestone-5
 */
public interface VsCodeProject extends HierarchicalElement, ProjectModel {
  /**
   * Returns the identifier for this Gradle project.
   *
   * @since 2.13
   */
  @Override
  ProjectIdentifier getProjectIdentifier();

  /** {@inheritDoc} */
  DomainObjectSet<? extends GradleTask> getTasks();

  /** {@inheritDoc} */
  @Override
  VsCodeProject getParent();

  /** {@inheritDoc} */
  @Override
  DomainObjectSet<? extends VsCodeProject> getChildren();

  /**
   * Returns the path of this project. This is a unique identifier for this project within the
   * build.
   *
   * @return The path.
   */
  String getPath();

  /**
   * Searches all descendants (children, grand-children, etc.), including self, by given path.
   *
   * @return Gradle project with matching path or {@code null} if not found.
   */
  @Nullable
  VsCodeProject findByPath(String path);

  /**
   * Returns the build script for this project.
   *
   * @return The build script.
   * @since 1.8
   * @throws UnsupportedMethodException For Gradle versions older than 1.8, where this method is not
   *     supported.
   */
  GradleScript getBuildScript() throws UnsupportedMethodException;

  /**
   * Returns the build directory for this project.
   *
   * @return The build directory.
   * @since 2.0
   * @throws UnsupportedMethodException For Gradle versions older than 2.0, where this method is not
   *     supported.
   */
  File getBuildDirectory() throws UnsupportedMethodException;

  /**
   * Returns the project directory for this project.
   *
   * @return The project directory.
   * @since 2.4
   * @throws UnsupportedMethodException For Gradle versions older than 2.4, where this method is not
   *     supported.
   */
  File getProjectDirectory() throws UnsupportedMethodException;
}
