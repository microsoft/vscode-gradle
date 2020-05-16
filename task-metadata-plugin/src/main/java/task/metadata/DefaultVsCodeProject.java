/*
 * Copyright 2018 the original author or authors.
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
import java.io.Serializable;
import java.util.Collection;
import java.util.LinkedList;
import java.util.List;
import org.gradle.plugins.ide.internal.tooling.model.DefaultGradleScript;
import org.gradle.tooling.internal.gradle.DefaultProjectIdentifier;
import org.gradle.tooling.internal.gradle.GradleProjectIdentity;

public class DefaultVsCodeProject implements Serializable, GradleProjectIdentity {
  private DefaultGradleScript buildScript = new DefaultGradleScript();
  private File buildDirectory;
  private File projectDirectory;
  private List<LaunchableGradleTask> tasks = new LinkedList<LaunchableGradleTask>();
  private String name;
  private String description;
  private DefaultProjectIdentifier projectIdentifier;
  private DefaultVsCodeProject parent;
  private List<? extends DefaultVsCodeProject> children = new LinkedList<DefaultVsCodeProject>();

  public String getName() {
    return name;
  }

  public DefaultVsCodeProject setName(String name) {
    this.name = name;
    return this;
  }

  public String getDescription() {
    return description;
  }

  public DefaultVsCodeProject setDescription(String description) {
    this.description = description;
    return this;
  }

  public DefaultVsCodeProject getParent() {
    return parent;
  }

  public DefaultVsCodeProject setParent(DefaultVsCodeProject parent) {
    this.parent = parent;
    return this;
  }

  public Collection<? extends DefaultVsCodeProject> getChildren() {
    return children;
  }

  public DefaultVsCodeProject setChildren(List<? extends DefaultVsCodeProject> children) {
    this.children = children;
    return this;
  }

  public String getPath() {
    return projectIdentifier.getProjectPath();
  }

  public DefaultProjectIdentifier getProjectIdentifier() {
    return projectIdentifier;
  }

  @Override
  public String getProjectPath() {
    return projectIdentifier.getProjectPath();
  }

  @Override
  public File getRootDir() {
    return projectIdentifier.getBuildIdentifier().getRootDir();
  }

  public DefaultVsCodeProject setProjectIdentifier(DefaultProjectIdentifier projectIdentifier) {
    this.projectIdentifier = projectIdentifier;
    return this;
  }

  public DefaultVsCodeProject findByPath(String path) {
    if (path.equals(this.getPath())) {
      return this;
    }
    for (DefaultVsCodeProject child : children) {
      DefaultVsCodeProject found = child.findByPath(path);
      if (found != null) {
        return found;
      }
    }

    return null;
  }

  public String toString() {
    return "GradleProject{" + "path='" + getPath() + '\'' + '}';
  }

  public Collection<LaunchableGradleTask> getTasks() {
    return tasks;
  }

  public DefaultVsCodeProject setTasks(List<LaunchableGradleTask> tasks) {
    this.tasks = tasks;
    return this;
  }

  public File getBuildDirectory() {
    return buildDirectory;
  }

  public DefaultVsCodeProject setBuildDirectory(File buildDirectory) {
    this.buildDirectory = buildDirectory;
    return this;
  }

  public File getProjectDirectory() {
    return projectDirectory;
  }

  public DefaultVsCodeProject setProjectDirectory(File projectDirectory) {
    this.projectDirectory = projectDirectory;
    return this;
  }

  public DefaultGradleScript getBuildScript() {
    return buildScript;
  }
}
