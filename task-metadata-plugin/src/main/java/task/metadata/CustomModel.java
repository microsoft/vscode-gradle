package task.metadata;

import java.util.List;

public interface CustomModel {
  boolean hasPlugin(Class type);

  abstract List<String> getTasks();

  abstract String getJavaSrcDir(int i);
}
