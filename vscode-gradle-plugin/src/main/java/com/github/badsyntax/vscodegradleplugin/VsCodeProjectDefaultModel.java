package com.github.badsyntax.vscodegradleplugin;

import java.io.Serializable;
import java.util.List;

public class VsCodeProjectDefaultModel implements Serializable {
  private List<String> debugTasks;

  public List<String> getDebugTasks() {
    return debugTasks;
  }

  public void setDebugTasks(List<String> debugTasks) {
    this.debugTasks = debugTasks;
  }
}
