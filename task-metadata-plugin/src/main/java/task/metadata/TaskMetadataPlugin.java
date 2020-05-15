package task.metadata;

import org.gradle.api.Plugin;
import org.gradle.api.Project;

public class TaskMetadataPlugin implements Plugin<Project> {
  public void apply(Project project) {
    project
        .getTasks()
        .register(
            "greeting",
            task -> {
              task.doLast(s -> System.out.println("Hello from plugin 'task.metadata.greeting'"));
            });
  }
}
