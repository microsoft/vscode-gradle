package com.microsoft.gradle.bs.importer;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.eclipse.core.resources.IProject;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;

import ch.epfl.scala.bsp4j.BuildTarget;

public class Utils {
    private Utils() {}

    public static boolean isGradleBuildServerProject(IProject project) {
        return ProjectUtils.hasNature(project, GradleBuildServerProjectNature.NATURE_ID);
    }

    /**
     * Map the build targets by their paths, the paths are get from the uri.
     * @param buildTargets
     * @return
     */
    public static Map<URI, List<BuildTarget>> mapBuildTargetsByProjectPath(List<BuildTarget> buildTargets) {
        return buildTargets.stream().collect(Collectors.groupingBy(target -> {
            return getUriWithoutQuery(target.getId().getUri());
        }));
    }

    public static URI getUriWithoutQuery(String uriString) {
        try {
            URI uri = new URI(uriString);
            return new URI(uri.getScheme(), uri.getHost(), uri.getPath(), null, uri.getFragment());
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Invalid uri: " + uriString, e);
        }
    }

}
