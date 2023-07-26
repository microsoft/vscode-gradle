package com.microsoft.gradle.bs.importer;

import org.eclipse.core.resources.IProject;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;

public class Utils {
    private Utils() {}

    public static boolean isGradleBuildServerProject(IProject project) {
        return ProjectUtils.hasNature(project, GradleBuildServerProjectNature.NATURE_ID);
    }

}
