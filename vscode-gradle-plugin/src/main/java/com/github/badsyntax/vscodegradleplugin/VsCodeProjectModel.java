package com.github.badsyntax.vscodegradleplugin;

import java.util.List;

public interface VsCodeProjectModel {
  abstract List<String> getDebugTasks();
}
