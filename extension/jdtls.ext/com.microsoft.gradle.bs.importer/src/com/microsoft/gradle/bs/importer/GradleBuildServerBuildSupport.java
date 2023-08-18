package com.microsoft.gradle.bs.importer;

import static org.eclipse.jdt.ls.core.internal.handlers.MapFlattener.getString;
import static org.eclipse.jdt.ls.core.internal.handlers.MapFlattener.getValue;

import java.io.File;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.core.runtime.Path;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.core.IClasspathAttribute;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.internal.core.ClasspathEntry;
import org.eclipse.jdt.launching.IVMInstall;
import org.eclipse.jdt.launching.JavaRuntime;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;
import org.eclipse.jdt.ls.core.internal.managers.IBuildSupport;
import org.eclipse.jdt.ls.core.internal.managers.ProjectsManager.CHANGE_TYPE;

import com.microsoft.gradle.bs.importer.model.GradleVersion;

import ch.epfl.scala.bsp4j.BuildServer;
import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.BuildTargetIdentifier;
import ch.epfl.scala.bsp4j.BuildTargetTag;
import ch.epfl.scala.bsp4j.DependencyModule;
import ch.epfl.scala.bsp4j.DependencyModulesItem;
import ch.epfl.scala.bsp4j.DependencyModulesParams;
import ch.epfl.scala.bsp4j.DependencyModulesResult;
import ch.epfl.scala.bsp4j.OutputPathItem;
import ch.epfl.scala.bsp4j.OutputPathsItem;
import ch.epfl.scala.bsp4j.OutputPathsParams;
import ch.epfl.scala.bsp4j.OutputPathsResult;
import ch.epfl.scala.bsp4j.ResourcesItem;
import ch.epfl.scala.bsp4j.ResourcesParams;
import ch.epfl.scala.bsp4j.ResourcesResult;
import ch.epfl.scala.bsp4j.SourceItem;
import ch.epfl.scala.bsp4j.SourcesItem;
import ch.epfl.scala.bsp4j.SourcesParams;
import ch.epfl.scala.bsp4j.SourcesResult;
import ch.epfl.scala.bsp4j.extended.JvmBuildTargetEx;

public class GradleBuildServerBuildSupport implements IBuildSupport {

    private static final String JAVA_HOME = "javaHome";
    private static final String GRADLE_VERSION = "gradleVersion";
    private static final String SOURCE_COMPATIBILITY = "sourceCompatibility";
    private static final String TARGET_COMPATIBILITY = "targetCompatibility";
    private static final Pattern GRADLE_FILE_EXT = Pattern.compile("^.*\\.gradle(\\.kts)?$");
    private static final String GRADLE_PROPERTIES = "gradle.properties";

    private static final String OUTPUT_KIND_SOURCE = "source";

    private static final IClasspathAttribute testAttribute = JavaCore.newClasspathAttribute(IClasspathAttribute.TEST, "true");
    private static final IClasspathAttribute optionalAttribute = JavaCore.newClasspathAttribute(IClasspathAttribute.OPTIONAL, "true");
    private static final IClasspathAttribute modularAttribute = JavaCore.newClasspathAttribute(IClasspathAttribute.MODULE, "true");

    @Override
    public boolean applies(IProject project) {
        return Utils.isGradleBuildServerProject(project);
    }

    @Override
    public void update(IProject project, boolean force, IProgressMonitor monitor) throws CoreException {
        if (!applies(project)) {
            return;
        }

        boolean shouldUpdate = GradleBuildServerProjectImporter.updateConfigurationDigest(project) || force;
        if (shouldUpdate) {
            IPath rootPath = ProjectUtils.findBelongedWorkspaceRoot(project.getLocation());
            if (rootPath == null) {
                JavaLanguageServerPlugin.logError("Cannot find workspace root for project: " + project.getName());
                return;
            }
            BuildServer buildServer = ImporterPlugin.getBuildServerConnection(rootPath);
            buildServer.workspaceReload().join();

            Map<URI, List<BuildTarget>> buildTargetMap = Utils.getBuildTargetsMappedByProjectPath(buildServer);
            for (URI uri : buildTargetMap.keySet()) {
                IProject projectFromUri = ProjectUtils.getProjectFromUri(uri.toString());
                if (projectFromUri == null || !Utils.isGradleBuildServerProject(projectFromUri)) {
                    continue;
                }
                updateClasspath(projectFromUri, monitor);
                updateProjectDependencies(projectFromUri, monitor);
                // TODO: in case that the projects/build targets are created or removed,
                // we can use the server->client notification: 'buildTarget/didChange' to support this case.
            }
        }
    }

    /**
     * Update the classpath of the project (except for the project dependencies), and
     * add Java nature if necessary.
     * @throws CoreException
     */
    public void updateClasspath(IProject project, IProgressMonitor monitor) throws CoreException {
        IPath rootPath = ProjectUtils.findBelongedWorkspaceRoot(project.getLocation());
        if (rootPath == null) {
            JavaLanguageServerPlugin.logError("Cannot find workspace root for project: " + project.getName());
            return;
        }
        BuildServer buildServer = ImporterPlugin.getBuildServerConnection(rootPath);
        // use map to dedupe the classpath entries having the same path field.
        Map<IPath, IClasspathEntry> classpathMap = new LinkedHashMap<>();
        List<BuildTarget> buildTargets = Utils.getBuildTargetsByProjectUri(buildServer, project.getLocationURI());
        // put test targets to the end of the list
        moveTestTargetsToEnd(buildTargets);

        for (BuildTarget buildTarget : buildTargets) {
            boolean isTest = buildTarget.getTags().contains(BuildTargetTag.TEST);
            OutputPathsResult outputResult = buildServer.buildTargetOutputPaths(
                    new OutputPathsParams(Arrays.asList(buildTarget.getId()))).join();
            String sourceOutputUri = getOutputUriByKind(outputResult.getItems(), OUTPUT_KIND_SOURCE);
            IPath sourceOutputFullPath = getOutputFullPath(sourceOutputUri, project);
            if (sourceOutputFullPath == null) {
                JavaLanguageServerPlugin.logError("Cannot find source output path for build target: " + buildTarget.getId());
            } else {
                SourcesResult sourcesResult = buildServer.buildTargetSources(
                        new SourcesParams(Arrays.asList(buildTarget.getId()))).join();
                List<IClasspathEntry> sourceEntries = getSourceEntries(rootPath, project, sourcesResult, sourceOutputFullPath, isTest, monitor);
                for (IClasspathEntry entry : sourceEntries) {
                    classpathMap.putIfAbsent(entry.getPath(), entry);
                }
            }

            String resourceOutputUri = getOutputUriByKind(outputResult.getItems(), "resource");
            IPath resourceOutputFullPath = getOutputFullPath(resourceOutputUri, project);
            // resource output is nullable according to Gradle API definition.
            if (resourceOutputFullPath != null) {
                ResourcesResult resourcesResult = buildServer.buildTargetResources(
                    new ResourcesParams(Arrays.asList(buildTarget.getId()))).join();
                List<IClasspathEntry> resourceEntries = getResourceEntries(project, resourcesResult, resourceOutputFullPath, isTest);
                for (IClasspathEntry entry : resourceEntries) {
                    classpathMap.putIfAbsent(entry.getPath(), entry);
                }
            }
        }

        // skip if no source roots are found from this project.
        if (classpathMap.isEmpty()) {
            return;
        }

        Utils.addNature(project, JavaCore.NATURE_ID, monitor);
        IJavaProject javaProject = JavaCore.create(project);
        // In Gradle, output of a source set may be overlapping with the source dir of another source set.
        javaProject.setOption(JavaCore.CORE_OUTPUT_LOCATION_OVERLAPPING_ANOTHER_SOURCE, "ignore" );

        // set all the source roots to the project first, then the information
        // of whether the project is modular will be available.
        classpathMap = getSourceCpeWithExclusions(new LinkedList<>(classpathMap.values()))
            .stream()
            .collect(Collectors.toMap(IClasspathEntry::getPath, Function.identity(), (e1, e2) -> e1, LinkedHashMap::new));
        javaProject.setRawClasspath(classpathMap.values().toArray(new IClasspathEntry[0]), monitor);
        boolean isModular = javaProject.getOwnModuleDescription() != null;

        setProjectJdk(classpathMap, buildTargets, javaProject, isModular);

        for (BuildTarget buildTarget : buildTargets) {
            boolean isTest = buildTarget.getTags().contains(BuildTargetTag.TEST);
            DependencyModulesResult dependencyModuleResult = buildServer.buildTargetDependencyModules(
                    new DependencyModulesParams(Arrays.asList(buildTarget.getId()))).join();
            List<IClasspathEntry> dependencyEntries = getDependencyJars(dependencyModuleResult, isTest, isModular);
            for (IClasspathEntry entry : dependencyEntries) {
                classpathMap.putIfAbsent(entry.getPath(), entry);
            }
        }

        javaProject.setRawClasspath(classpathMap.values().toArray(new IClasspathEntry[0]), monitor);
    }

    /**
     * Update the project dependencies of the project.
     * @throws CoreException
     */
    public void updateProjectDependencies(IProject project, IProgressMonitor monitor) throws CoreException {
        IPath rootPath = ProjectUtils.findBelongedWorkspaceRoot(project.getLocation());
        if (rootPath == null) {
            JavaLanguageServerPlugin.logError("Cannot find workspace root for project: " + project.getName());
            return;
        }
        BuildServer buildServer = ImporterPlugin.getBuildServerConnection(rootPath);
        List<BuildTarget> buildTargets = Utils.getBuildTargetsByProjectUri(buildServer, project.getLocationURI());
        Set<BuildTargetIdentifier> projectDependencies = new HashSet<>();
        for (BuildTarget buildTarget : buildTargets) {
            projectDependencies.addAll(buildTarget.getDependencies());
        }
        IJavaProject javaProject = JavaCore.create(project);
        List<IClasspathEntry> classpath = new LinkedList<>(Arrays.asList(javaProject.getRawClasspath()));
        classpath.addAll(getProjectDependencyEntries(projectDependencies));
        javaProject.setRawClasspath(classpath.toArray(IClasspathEntry[]::new), javaProject.getOutputLocation(), monitor);
    }

    private List<IClasspathEntry> getProjectDependencyEntries(Set<BuildTargetIdentifier> projectDependencies) {
        List<IClasspathEntry> entries = new LinkedList<>();
        for (BuildTargetIdentifier dependency : projectDependencies) {
            URI uri = Utils.getUriWithoutQuery(dependency.getUri());
            IProject dependencyProject = ProjectUtils.getProjectFromUri(uri.toString());
            if (dependencyProject != null) {
                entries.add(JavaCore.newProjectEntry(dependencyProject.getFullPath()));
            }
        }
        return entries;
    }

    @Override
    public boolean fileChanged(IResource resource, CHANGE_TYPE changeType, IProgressMonitor monitor) throws CoreException {
        if (resource == null || !applies(resource.getProject())) {
            return false;
        }
        return isBuildFile(resource) || IBuildSupport.super.fileChanged(resource, changeType, monitor);
    }

    @Override
    public boolean isBuildFile(IResource resource) {
        return resource != null && resource.getType() == IResource.FILE && isBuildLikeFileName(resource.getName())
                && Utils.isGradleBuildServerProject(resource.getProject());
    }

    @Override
    public boolean isBuildLikeFileName(String fileName) {
        return GRADLE_FILE_EXT.matcher(fileName).matches() || fileName.equals(GRADLE_PROPERTIES);
    }

    /**
     * Return a list of classpath entries for all the source roots.
     *
     * @param rootPath the workspace root path.
     * @param project the project.
     * @param sourcesResult the sources result from build server.
     * @param outputFullPath the output full path.
     * @param isTest whether the source is test source.
     * @param monitor the progress monitor.
     * @throws CoreException
     */
    private List<IClasspathEntry> getSourceEntries(IPath rootPath, IProject project, SourcesResult sourcesResult, IPath outputFullPath, boolean isTest, IProgressMonitor monitor) throws CoreException {
        List<IClasspathEntry> sourceEntries = new LinkedList<>();
        for (SourcesItem sources : sourcesResult.getItems()) {
            for (SourceItem source : sources.getSources()) {
                IPath sourcePath = ResourceUtils.filePathFromURI(source.getUri());
                IPath projectLocation = project.getLocation();
                IPath sourceFullPath;
                if (projectLocation.isPrefixOf(sourcePath)) {
                    IPath relativeSourcePath = sourcePath.makeRelativeTo(project.getLocation());
                    sourceFullPath = project.getFolder(relativeSourcePath).getFullPath();
                } else {
                    // if the source path is not relative to the project location, we need to create a linked folder for it.
                    IPath relativeSourcePath = sourcePath.makeRelativeTo(rootPath);
                    if (relativeSourcePath.isAbsolute()) {
                        JavaLanguageServerPlugin.logError("The source path is not relative to the workspace root: " + relativeSourcePath);
                        continue;
                    }
                    IFolder linkFolder = project.getFolder(String.join("_", relativeSourcePath.segments()));
                    if (!linkFolder.exists()) {
                        linkFolder.createLink(sourcePath, IResource.REPLACE | IResource.ALLOW_MISSING_LOCAL, monitor);
                    }
                    sourceFullPath = linkFolder.getFullPath();
                }
                // Continue if this source path has already been added.
                if (sourceEntries.stream().anyMatch(entry -> entry.getPath().equals(sourceFullPath))) {
                    continue;
                }
                List<IClasspathAttribute> classpathAttributes = new LinkedList<>();
                if (isTest) {
                    classpathAttributes.add(testAttribute);
                }

                // if the source path is in the build directory, adding optional attribute to it
                // because it might be cleaned.
                if (!sourcePath.toFile().exists() || source.getGenerated() || isInBuildDir(sourceFullPath)) {
                    classpathAttributes.add(optionalAttribute);
                }
                sourceEntries.add(JavaCore.newSourceEntry(
                    sourceFullPath,
                    null,
                    null,
                    outputFullPath,
                    classpathAttributes.toArray(new IClasspathAttribute[0])
                ));
            }
        }
        return sourceEntries;
    }

    private List<IClasspathEntry> getResourceEntries(IProject project, ResourcesResult resourcesResult, IPath outputFullPath, boolean isTest) {
        List<IClasspathEntry> resourceEntries = new LinkedList<>();
        for (ResourcesItem resources : resourcesResult.getItems()) {
            for (String resourceUri : resources.getResources()) {
                IPath resourcePath = ResourceUtils.filePathFromURI(resourceUri);
                IPath relativeResourcePath = resourcePath.makeRelativeTo(project.getLocation());
                IPath resourceFullPath = project.getFolder(relativeResourcePath).getFullPath();
                List<IClasspathAttribute> classpathAttributes = new LinkedList<>();
                if (isTest) {
                    classpathAttributes.add(testAttribute);
                }
                // resource folder may not exist.
                classpathAttributes.add(optionalAttribute);
                resourceEntries.add(JavaCore.newSourceEntry(
                    resourceFullPath,
                    null,
                    null,
                    outputFullPath,
                    classpathAttributes.toArray(new IClasspathAttribute[0])
                ));
            }
        }
        return resourceEntries;
    }

    private void moveTestTargetsToEnd(List<BuildTarget> buildTargets) {
        buildTargets.sort((bt1, bt2) -> {
            return Boolean.compare(bt1.getTags().contains(BuildTargetTag.TEST),
                bt2.getTags().contains(BuildTargetTag.TEST));
        });
    }

    /**
     * Get the output full path which is used in the classpath entry.
     * @throws CoreException
     */
    private IPath getOutputFullPath(String outputUri, IProject project) throws CoreException {
        if (StringUtils.isBlank(outputUri)) {
            return null;
        }

        IPath sourceOutputPath = ResourceUtils.filePathFromURI(Utils.getUriWithoutQuery(outputUri).toString());
        File outputDirectory = sourceOutputPath.toFile();
        if (!outputDirectory.exists()) {
            outputDirectory.mkdirs();
        }
        IPath relativeSourceOutputPath = sourceOutputPath.makeRelativeTo(project.getLocation());
        IFolder outputFolder = project.getFolder(relativeSourceOutputPath);
        outputFolder.refreshLocal(IResource.DEPTH_ZERO, new NullProgressMonitor());
        return outputFolder.getFullPath();
    }

    /**
     * Return the first found output uri by kind. Each Gradle build target (source set)
     * has only one output path for source and resource output.
     *
     * @param items the output items.
     * @param kind the kind of the output uri.
     */
    private String getOutputUriByKind(List<OutputPathsItem> items, String kind) {
        for (OutputPathsItem outputs : items) {
            for (OutputPathItem output : outputs.getOutputPaths()) {
                if (Objects.equals(kind, Utils.getQueryValueByKey(output.getUri(), "kind"))) {
                    return output.getUri();
                }
            }
        }
        return "";
    }

    private boolean isInBuildDir(IPath sourceFullPath) {
        return Arrays.stream(sourceFullPath.segments()).anyMatch(segment -> segment.equals("build"));
    }

    private void setProjectJdk(Map<IPath, IClasspathEntry> classpathMap, List<BuildTarget> buildTargets,
            IJavaProject javaProject, boolean isModular) throws CoreException {
        JvmBuildTargetEx jvmBuildTarget = getJvmTarget(buildTargets);
        String sourceCompatibility = jvmBuildTarget.getSourceCompatibility();
        if (StringUtils.isNotBlank(sourceCompatibility)) {
            javaProject.setOption(JavaCore.COMPILER_SOURCE, sourceCompatibility);
        }

        String targetCompatibility = jvmBuildTarget.getTargetCompatibility();
        if (StringUtils.isNotBlank(targetCompatibility)) {
            javaProject.setOption(JavaCore.COMPILER_CODEGEN_TARGET_PLATFORM, targetCompatibility);
            // source compatibility will be equal to or lower than the target compatibility.
            // See: https://discuss.gradle.org/t/why-cant-i-use-different-sourcecompatibility-targetcompatibility-with-hello-world/11958/2
            javaProject.setOption(JavaCore.COMPILER_COMPLIANCE, targetCompatibility);
        }

        String highestJavaVersion = getHighestCompatibleJavaVersion(jvmBuildTarget.getGradleVersion());
        try {
            IVMInstall vm = EclipseVmUtil.findOrRegisterStandardVM(sourceCompatibility,
                    highestJavaVersion, new File(new URI(jvmBuildTarget.getJavaHome())));
            IClasspathEntry jdkEntry = JavaCore.newContainerEntry(
                JavaRuntime.newJREContainerPath(vm),
                ClasspathEntry.NO_ACCESS_RULES,
                isModular ? new IClasspathAttribute[] { modularAttribute } : ClasspathEntry.NO_EXTRA_ATTRIBUTES,
                false /*isExported*/
            );
            classpathMap.putIfAbsent(jdkEntry.getPath(), jdkEntry);
        } catch (URISyntaxException e) {
            throw new CoreException(new Status(IStatus.ERROR, ImporterPlugin.PLUGIN_ID,
                    "Invalid Java home: " + jvmBuildTarget.getJavaHome(), e));
        }
    }

    /**
     * Get the extended JVM build target.
     * <p>
     * Note: Gradle supports different source/target compatibilities for different source sets, while in JDT, one project
     * can only have one set of settings. Here we have to pick one (default to 'main') from all the build targets.
     * In the future, we can consider to one project per each build target.
     */
    private JvmBuildTargetEx getJvmTarget(List<BuildTarget> buildTargets) throws CoreException {
        BuildTarget mainBuildTarget = buildTargets.stream().filter(bt -> {
            String sourceSetName = Utils.getQueryValueByKey(bt.getId().getUri(), "sourceset");
            return "main".equals(sourceSetName);
        }).findFirst().orElse(null);

        if (mainBuildTarget == null) {
            mainBuildTarget = buildTargets.get(0);
        }

        JvmBuildTargetEx jvmTarget = null;
        // https://build-server-protocol.github.io/docs/extensions/jvm#jvmbuildtarget
        if ("jvm".equals(mainBuildTarget.getDataKind())) {
            String javaHome = getString((Map) mainBuildTarget.getData(), JAVA_HOME);
            if (StringUtils.isBlank(javaHome)) {
                throw new CoreException(new Status(IStatus.ERROR, ImporterPlugin.PLUGIN_ID, "javaHome is unavailable."));
            }
            jvmTarget = new JvmBuildTargetEx(javaHome, null);

            String gradleVersion = getString((Map) mainBuildTarget.getData(), GRADLE_VERSION);
            if (StringUtils.isBlank(gradleVersion)) {
                throw new CoreException(new Status(IStatus.ERROR, ImporterPlugin.PLUGIN_ID, "gradleVersion is unavailable."));
            }
            jvmTarget.setGradleVersion(gradleVersion);

            String sourceCompatibility = getString((Map) mainBuildTarget.getData(), SOURCE_COMPATIBILITY);
            jvmTarget.setSourceCompatibility(getEclipseCompatibleVersion(sourceCompatibility));
            String targetCompatibility = getString((Map) mainBuildTarget.getData(), TARGET_COMPATIBILITY);
            jvmTarget.setTargetCompatibility(getEclipseCompatibleVersion(targetCompatibility));
        }

        if (jvmTarget == null) {
            throw new CoreException(new Status(IStatus.ERROR, ImporterPlugin.PLUGIN_ID, "JVM target is unavailable."));
        }

        return jvmTarget;
    }

    /**
     * Some legacy Gradle (e.g. v6) uses "1.9" and "1.10" to represent Java 9 and 10.
     * We do a conversion here to make it compatible with Eclipse.
     */
    private String getEclipseCompatibleVersion(String javaVersion) {
        if ("1.9".equals(javaVersion)) {
            return "9";
        } else if ("1.10".equals(javaVersion)) {
            return "10";
        }

        return javaVersion;
    }

    private List<IClasspathEntry> getDependencyJars(DependencyModulesResult dependencyModuleResult, boolean isTest,
            boolean isModular) {
        List<IClasspathEntry> dependencyEntries = new LinkedList<>();
        for (DependencyModulesItem item : dependencyModuleResult.getItems()) {
            for (DependencyModule module : item.getModules()) {
                if (!"maven".equals(module.getDataKind())) {
                    continue;
                }
                List<Map> artifacts = (List<Map>) getValue((Map) module.getData(), "artifacts");
                if (artifacts == null) {
                    continue;
                }

                File artifact = null;
                File sourceArtifact = null;
                for (Map artifactData : artifacts) {
                    String uri = (String) getValue(artifactData, "uri");
                    if (uri == null) {
                        continue;
                    }
                    String classifier = (String) getValue(artifactData, "classifier");
                    try {
                        File jarFile = new File(new URI(uri));
                        if (classifier == null) {
                            artifact = jarFile;
                        } else if ("sources".equals(classifier)) {
                            sourceArtifact = jarFile;
                        }
                    } catch (URISyntaxException e) {
                        JavaLanguageServerPlugin.logException(e);
                        continue;
                    }
                }

                if (artifact == null) {
                    continue;
                }

                List<IClasspathAttribute> attributes = new LinkedList<>();
                if (isTest) {
                    attributes.add(testAttribute);
                } else if (isModular) {
                    // Assume that a test-only dependency is not a module, which corresponds
                    // to how Eclipse does test running for modules:
                    // It patches the main module with the tests and expects test dependencies
                    // to be part of the unnamed module (classpath).
                    attributes.add(modularAttribute);
                }
                if (!artifact.exists()) {
                    attributes.add(optionalAttribute);
                }

                dependencyEntries.add(JavaCore.newLibraryEntry(
                        new Path(artifact.getAbsolutePath()),
                        sourceArtifact == null ? null : new Path(sourceArtifact.getAbsolutePath()),
                        null,
                        ClasspathEntry.NO_ACCESS_RULES,
                        attributes.size() == 0 ? ClasspathEntry.NO_EXTRA_ATTRIBUTES : attributes.toArray(new IClasspathAttribute[attributes.size()]),
                        false
                ));
            }
        }

        return dependencyEntries;
    }

    /**
     * Get the highest compatible Java version for the current Gradle version, according
     * to https://docs.gradle.org/current/userguide/compatibility.html
     *
     * <p>If none of the compatible Java versions is found, then return the Java version
     * that is used to launch Gradle.
     */
    private String getHighestCompatibleJavaVersion(String gradleVersion) {
      GradleVersion version = GradleVersion.version(gradleVersion);
      if (version.compareTo(GradleVersion.version("7.6")) >= 0) {
        return JavaCore.VERSION_19;
      } else if (version.compareTo(GradleVersion.version("7.5")) >= 0) {
        return JavaCore.VERSION_18;
      } else if (version.compareTo(GradleVersion.version("7.3")) >= 0) {
        return JavaCore.VERSION_17;
      } else if (version.compareTo(GradleVersion.version("7.0")) >= 0) {
        return JavaCore.VERSION_16;
      } else if (version.compareTo(GradleVersion.version("6.7")) >= 0) {
        return JavaCore.VERSION_15;
      } else if (version.compareTo(GradleVersion.version("6.3")) >= 0) {
        return JavaCore.VERSION_14;
      } else if (version.compareTo(GradleVersion.version("6.0")) >= 0) {
        return JavaCore.VERSION_13;
      } else if (version.compareTo(GradleVersion.version("5.4")) >= 0) {
        return JavaCore.VERSION_12;
      } else if (version.compareTo(GradleVersion.version("5.0")) >= 0) {
        return JavaCore.VERSION_11;
      } else if (version.compareTo(GradleVersion.version("4.7")) >= 0) {
        return JavaCore.VERSION_10;
      } else if (version.compareTo(GradleVersion.version("4.3")) >= 0) {
        return JavaCore.VERSION_9;
      } else if (version.compareTo(GradleVersion.version("2.0")) >= 0) {
        return JavaCore.VERSION_1_8;
      }

      return JavaCore.VERSION_1_8;
    }

    /**
     * Get list of source classpath entries with exclusion patterns added.
     */
    private List<IClasspathEntry> getSourceCpeWithExclusions(List<IClasspathEntry> sourceEntries) {
        // Sort the source paths to make the child folders come first. The order is important,
        // otherwise, we will get xxx does not exist error.
        Collections.sort(sourceEntries, (path1, path2) -> path1.getPath().toString().compareTo(path2.getPath().toString()) * -1);

        List<IClasspathEntry> newSourceEntries = new LinkedList<>();
        for (IClasspathEntry currentEntry : sourceEntries) {
            List<IPath> exclusionPatterns = new ArrayList<>();
            for (IClasspathEntry sourceEntry : newSourceEntries) {
                if (Objects.equals(currentEntry.getPath(), sourceEntry.getPath())) {
                    continue;
                }

                if (currentEntry.getPath().isPrefixOf(sourceEntry.getPath())) {
                    exclusionPatterns.add(sourceEntry.getPath().makeRelativeTo(currentEntry.getPath()).addTrailingSeparator());
                }
            }
            newSourceEntries.add(JavaCore.newSourceEntry(
                currentEntry.getPath(),
                currentEntry.getInclusionPatterns(),
                exclusionPatterns.toArray(new IPath[0]),
                currentEntry.getOutputLocation(),
                currentEntry.getExtraAttributes()
            ));
        }

        return newSourceEntries;
    }
}
