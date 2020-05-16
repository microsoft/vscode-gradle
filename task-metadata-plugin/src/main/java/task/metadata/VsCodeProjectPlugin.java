package task.metadata;

import static task.metadata.ToolingModelBuilderSupport.buildFromTask;

import java.util.ArrayList;
import java.util.List;
import java.util.SortedSet;
import javax.inject.Inject;
import org.gradle.api.Plugin;
import org.gradle.api.Project;
import org.gradle.api.Task;
import org.gradle.api.internal.tasks.TaskContainerInternal;
import org.gradle.tooling.internal.gradle.DefaultProjectIdentifier;
import org.gradle.tooling.provider.model.ToolingModelBuilder;
import org.gradle.tooling.provider.model.ToolingModelBuilderRegistry;

public class VsCodeProjectPlugin implements Plugin<Project> {
  private final ToolingModelBuilderRegistry registry;

  @Inject
  public VsCodeProjectPlugin(ToolingModelBuilderRegistry registry) {
    this.registry = registry;
  }

  public void apply(Project project) {
    registry.register(new VsCodeProjectBuilder());
  }

  public class VsCodeProjectBuilder implements ToolingModelBuilder {

    @Override
    public boolean canBuild(String modelName) {
      return modelName.equals(VsCodeProject.class.getName());
    }

    @Override
    public Object buildAll(String modelName, Project project) {
      return buildHierarchy(project.getRootProject());
    }

    public DefaultVsCodeProject buildAll(Project project) {
      return buildHierarchy(project.getRootProject());
    }

    private DefaultVsCodeProject buildHierarchy(Project project) {
      List<DefaultVsCodeProject> children = new ArrayList<DefaultVsCodeProject>();
      for (Project child : project.getChildProjects().values()) {
        children.add(buildHierarchy(child));
      }

      DefaultVsCodeProject gradleProject =
          new DefaultVsCodeProject()
              .setProjectIdentifier(
                  new DefaultProjectIdentifier(project.getRootDir(), project.getPath()))
              .setName(project.getName())
              .setDescription(project.getDescription())
              .setBuildDirectory(project.getBuildDir())
              .setProjectDirectory(project.getProjectDir())
              .setChildren(children);

      gradleProject.getBuildScript().setSourceFile(project.getBuildFile());

      /*
        Internal system property to investigate model loading performance in IDEA/Android Studio.
        The model loading can be altered with the following values:
          - "omit_all_tasks": The model builder won't realize the task graph. The returned model will contain an empty task list.
          - "skip_task_graph_realization":  The model builder won't realize the task graph. The returned model will contain artificial tasks created from the task names.
          - "skip_task_serialization":  The model builder will realize the task graph but won't send it to the client.
          - "unmodified" (or any other value): The model builder will run unchanged.
      */
      String projectOptions =
          System.getProperty("org.gradle.internal.GradleProjectBuilderOptions", "unmodified");
      List<LaunchableGradleTask> tasks =
          tasks(gradleProject, (TaskContainerInternal) project.getTasks(), projectOptions);

      if (!"skip_task_serialization".equals(projectOptions)) {
        gradleProject.setTasks(tasks);
      }

      for (DefaultVsCodeProject child : children) {
        child.setParent(gradleProject);
      }

      return gradleProject;
    }

    private List<LaunchableGradleTask> tasks(
        DefaultVsCodeProject owner, TaskContainerInternal tasks, String projectOptions) {
      // if ("omit_all_tasks".equals(projectOptions)) {
      //   return Collections.emptyList();
      // } else if ("skip_task_graph_realization".equals(projectOptions)) {
      //   return tasks.getNames().stream()
      //       .map(
      //           t ->
      //               buildFromTaskName(
      //                   new LaunchableGradleProjectTask(), owner.getProjectIdentifier(), t))
      //       .collect(Collectors.toList());
      // }

      tasks.realize();
      SortedSet<String> taskNames = tasks.getNames();
      List<LaunchableGradleTask> out = new ArrayList<LaunchableGradleTask>(taskNames.size());
      for (String taskName : taskNames) {
        Task task = tasks.findByName(taskName);
        if (task != null) {
          out.add(
              buildFromTask(new LaunchableGradleProjectTask(), owner.getProjectIdentifier(), task)
                  .setProject(owner));
        }
      }

      return out;
    }

    public <T extends LaunchableGradleTask> T buildFromTaskName(
        T target, DefaultProjectIdentifier projectIdentifier, String taskName) {
      String taskPath = projectIdentifier.getProjectPath() + ":" + taskName;
      target
          .setPath(taskPath)
          .setName(taskName)
          .setGroup("undefined")
          .setDisplayName(taskPath)
          .setDescription("")
          .setPublic(true)
          .setType(null)
          .setProjectIdentifier(projectIdentifier);
      return target;
    }
  }
}
