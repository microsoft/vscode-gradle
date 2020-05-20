package com.github.badsyntax.vscodegradleplugin;

import java.util.ArrayList;
import java.util.List;
import javax.inject.Inject;
import org.gradle.api.Plugin;
import org.gradle.api.Project;
import org.gradle.api.tasks.JavaExec;
import org.gradle.api.tasks.TaskContainer;
import org.gradle.api.tasks.testing.Test;
import org.gradle.tooling.provider.model.ToolingModelBuilder;
import org.gradle.tooling.provider.model.ToolingModelBuilderRegistry;

public class VsCodeProjectPlugin implements Plugin<Project> {

  private final ToolingModelBuilderRegistry registry;

  @Inject
  public VsCodeProjectPlugin(ToolingModelBuilderRegistry registry) {
    this.registry = registry;
  }

  public void apply(Project project) {
    registry.register(new TaskMetadataToolingModelBuilder());
  }

  private static class TaskMetadataToolingModelBuilder implements ToolingModelBuilder {
    @Override
    public boolean canBuild(String modelName) {
      return modelName.equals(VsCodeProjectModel.class.getName());
    }

    @Override
    public Object buildAll(String modelName, Project project) {
      VsCodeProjectDefaultModel model = new VsCodeProjectDefaultModel();
      List<String> debugTasks = new ArrayList<String>();
      project
          .getAllprojects()
          .forEach(
              gradleProject -> {
                TaskContainer projectTasks = gradleProject.getTasks();
                projectTasks
                    .withType(JavaExec.class)
                    .forEach(task -> debugTasks.add(task.getPath()));
                projectTasks.withType(Test.class).forEach(task -> debugTasks.add(task.getPath()));
              });
      model.setDebugTasks(debugTasks);
      return model;
    }
  }
}
