package com.microsoft.gradle.bs.importer;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.URIUtil;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;

import ch.epfl.scala.bsp4j.BuildServer;
import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.WorkspaceBuildTargetsResult;

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

    public static List<BuildTarget> getBuildTargetsByProjectUri(BuildServer serverConnection, URI projectUri) {
        if (projectUri == null) {
            throw new IllegalArgumentException("projectPath cannot be null.");
        }

        WorkspaceBuildTargetsResult workspaceBuildTargetsResult = serverConnection.workspaceBuildTargets().join();
        List<BuildTarget> buildTargets = workspaceBuildTargetsResult.getTargets();

        return buildTargets.stream().filter(target ->
                URIUtil.sameURI(projectUri, getUriWithoutQuery(target.getId().getUri()))
        ).collect(Collectors.toList());
    }

    /**
   * Returns the query value by key from the URI.
   */
  public static String getQueryValueByKey(String uriString, String key) {
    try {
      URI uri = new URI(uriString);
      if (uri.getQuery() == null) {
        return "";
      }

      String query = uri.getQuery();
      String[] pairs = query.split("&");
      for (String pair : pairs) {
        int idx = pair.indexOf("=");
        if (idx > 0 && key.equals(pair.substring(0, idx))) {
          return pair.substring(idx + 1);
        }
      }

      return "";
    } catch (URISyntaxException e) {
      throw new IllegalArgumentException("Invalid uri: " + uriString, e);
    }
  }

}
