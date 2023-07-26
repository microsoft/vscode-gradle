package com.microsoft.gradle.bs.importer;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.core.resources.IProject;

import ch.epfl.scala.bsp4j.BuildTarget;

public class BuildTargetManager {

    private Map<IProject, List<BuildTarget>> cache = new HashMap<>();

    public List<BuildTarget> getBuildTargets(IProject project) {
        return cache.get(project);
    }

    public void setBuildTargets(IProject project, List<BuildTarget> targets) {
        cache.put(project, targets);
    }
}
