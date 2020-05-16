package task.metadata;

import java.io.File;
import java.io.IOException;
import java.io.Serializable;
import java.util.List;

public class DefaultModel implements Serializable {
  private final List<String> pluginClassNames;
  private List<File> javaSrcDirs = null;
  private List<String> tasks;

  public List<File> getjavaSrcDirs() {
    return javaSrcDirs;
  }

  public List<String> getTasks() {
    return tasks;
  }

  public void setjavaSrcDirs(List<File> javaSrcDirs) {
    this.javaSrcDirs = javaSrcDirs;
  }

  public void setTasks(List<String> tasks) {
    this.tasks = tasks;
  }

  public DefaultModel(List<String> pluginClassNames) {
    this.pluginClassNames = pluginClassNames;
  }

  public boolean hasPlugin(Class type) {
    return pluginClassNames.contains(type.getName());
  }

  public String getJavaSrcDir(int i) throws IOException {
    return javaSrcDirs.get(i).getCanonicalPath();
  }
}
