package task.metadata;

import static org.junit.Assert.*;

import org.gradle.api.Project;
import org.gradle.testfixtures.ProjectBuilder;
import org.junit.Test;

public class TaskMetadataPluginTest {
  @Test
  public void pluginRegistersATask() {
    Project project = ProjectBuilder.builder().build();
    project.getPlugins().apply("task.metadata.greeting");

    assertNotNull(project.getTasks().findByName("greeting"));
  }
}
