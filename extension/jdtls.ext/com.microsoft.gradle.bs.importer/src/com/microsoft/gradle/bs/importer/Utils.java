package com.microsoft.gradle.bs.importer;

import static org.eclipse.jdt.ls.core.internal.handlers.MapFlattener.getString;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.eclipse.core.resources.ICommand;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IProjectDescription;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IncrementalProjectBuilder;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.core.runtime.URIUtil;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.ls.core.internal.JavaClientConnection.JavaLanguageClient;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences;
import org.eclipse.lsp4j.ExecuteCommandParams;

import com.microsoft.gradle.bs.importer.builder.BuildServerBuilder;

import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.WorkspaceBuildTargetsResult;

public class Utils {
    private Utils() {}

    private static final String JAVA_BUILD_SERVER_GRADLE_ENABLED = "java.gradle.buildServer.enabled";

    public static boolean isGradleBuildServerProject(IProject project) {
        return ProjectUtils.hasNature(project, GradleBuildServerProjectNature.NATURE_ID);
    }

    /**
     * Get build targets mapped by their paths, the paths are get from the uri.
     */
    public static Map<URI, List<BuildTarget>> getBuildTargetsMappedByProjectPath(BuildServerConnection serverConnection) {
        WorkspaceBuildTargetsResult workspaceBuildTargetsResult = serverConnection.workspaceBuildTargets().join();
        List<BuildTarget> buildTargets = workspaceBuildTargetsResult.getTargets();
        return buildTargets.stream().collect(Collectors.groupingBy(target -> getUriWithoutQuery(target.getId().getUri())));
    }

    public static URI getUriWithoutQuery(String uriString) {
        try {
            URI uri = new URI(uriString);
            return new URI(uri.getScheme(), uri.getHost(), uri.getPath(), null, uri.getFragment());
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Invalid uri: " + uriString, e);
        }
    }

    public static List<BuildTarget> getBuildTargetsByProjectUri(BuildServerConnection serverConnection, URI projectUri) {
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

  /**
   * Add nature to the project if the input nature does not exist in project description.
   * @throws CoreException
   */
  public static void addNature(IProject project, String natureId, IProgressMonitor monitor) throws CoreException {
    SubMonitor progress = SubMonitor.convert(monitor, 1);
    // get the description
    IProjectDescription description = project.getDescription();

    // abort if the project already has the nature applied or the nature is not defined
    List<String> currentNatureIds = Arrays.asList(description.getNatureIds());
    if (currentNatureIds.contains(natureId)) {
        return;
    }

    // add the nature to the project
    List<String> newIds = new LinkedList<>();
    newIds.addAll(currentNatureIds);
    newIds.add(0, natureId);
    description.setNatureIds(newIds.toArray(new String[newIds.size()]));

    // save the updated description
    project.setDescription(description, IResource.AVOID_NATURE_CONFIG, progress.newChild(1));
  }

  /**
   * Add the builders to the project description if the input builders do not exist in description.
   * All the configuration of the builder will be set to default.
   *
   * @param project the project description.
   * @param buildNames the names of the builder.
   */
  public static void addBuildSpec(IProjectDescription description, String[] buildNames) {
    ICommand[] commands = Arrays.stream(buildNames).map(buildName -> {
      ICommand buildSpec = description.newCommand();
      buildSpec.setBuilderName(buildName);
      return buildSpec;
    }).toArray(ICommand[]::new);
    addBuildSpec(description, commands);
  }

  /**
   * Add the builders to the project description if the input builders do not exist in description.
   *
   * @param project the project description.
   * @param buildSpecs the builders to add.
   */
  public static void addBuildSpec(IProjectDescription description, ICommand[] buildSpecs) {
    List<ICommand> currentBuildSpecs = Arrays.asList(description.getBuildSpec());
    List<ICommand> newSpecs = new LinkedList<>();
    newSpecs.addAll(currentBuildSpecs);
    for (ICommand buildSpec : buildSpecs) {
      if (currentBuildSpecs.stream().anyMatch(spec -> Objects.equals(spec.getBuilderName(), buildSpec.getBuilderName()))) {
          continue;
      }
      newSpecs.add(0, buildSpec);
    }

    description.setBuildSpec(newSpecs.toArray(new ICommand[newSpecs.size()]));
  }

  /**
   * Remove the builders and natures that are introduced by Buildship.
   */
  public static void removeBuildshipConfigurations(IProjectDescription description) {
    ICommand[] commands = description.getBuildSpec();
    List<ICommand> newSpecs = new LinkedList<>();
    for (ICommand command : commands) {
      if (!isExcludedBuilder(command.getBuilderName())) {
        newSpecs.add(command);
      }
    }
    description.setBuildSpec(newSpecs.toArray(new ICommand[newSpecs.size()]));

    String[] natureIds = description.getNatureIds();
    List<String> newNatureIds = new LinkedList<>();
    for (String natureId : natureIds) {
      if (!Objects.equals(natureId, "org.eclipse.buildship.core.gradleprojectnature")) {
        newNatureIds.add(natureId);
      }
    }
    description.setNatureIds(newNatureIds.toArray(new String[newNatureIds.size()]));
  }

  private static boolean isExcludedBuilder(String builderName) {
    return Objects.equals(builderName, JavaCore.BUILDER_ID)
        || Objects.equals(builderName, "org.eclipse.buildship.core.gradleprojectbuilder");
  }

  /**
   * Get the build spec for the build server builder with {@link AUTO_BUILD} and
   * {@link CLEAN_BUILD} disabled.
   */
  public static ICommand getBuildServerBuildSpec(IProjectDescription description) {
    ICommand buildSpec = description.newCommand();
    buildSpec.setBuilderName(BuildServerBuilder.BUILDER_ID);
    buildSpec.setBuilding(IncrementalProjectBuilder.AUTO_BUILD, false);
    buildSpec.setBuilding(IncrementalProjectBuilder.CLEAN_BUILD, false);
    return buildSpec;
  }

  public static boolean isBuildServerEnabled(Preferences preferences) {
    if (preferences == null) {
      return false;
    }

    if (!preferences.isImportGradleEnabled()) {
      return false;
    }

    String bspImporterEnabled = getString(preferences.asMap(), JAVA_BUILD_SERVER_GRADLE_ENABLED);
    return "on".equalsIgnoreCase(bspImporterEnabled);
  }

  public static void sendTelemetry(JavaLanguageClient client, Object message) {
    client.sendNotification(new ExecuteCommandParams("_java.gradle.buildServer.sendTelemetry",
        Arrays.asList(message)));
  }
}
