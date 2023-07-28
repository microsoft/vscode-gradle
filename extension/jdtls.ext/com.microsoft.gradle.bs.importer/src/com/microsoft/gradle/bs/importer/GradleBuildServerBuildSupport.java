package com.microsoft.gradle.bs.importer;

import java.io.File;
import java.util.Arrays;
import java.util.LinkedList;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IProjectDescription;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jdt.core.IClasspathAttribute;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;
import org.eclipse.jdt.ls.core.internal.managers.IBuildSupport;

import ch.epfl.scala.bsp4j.BuildServer;
import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.BuildTargetTag;
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
import ch.epfl.scala.bsp4j.WorkspaceBuildTargetsResult;

public class GradleBuildServerBuildSupport implements IBuildSupport {

    private static final Pattern GRADLE_FILE_EXT = Pattern.compile("^.*\\.gradle(\\.kts)?$");
    private static final String GRADLE_PROPERTIES = "gradle.properties";

    private static final String OUTPUT_KIND_SOURCE = "source";

    private static final IClasspathAttribute testAttribute = JavaCore.newClasspathAttribute(IClasspathAttribute.TEST, "true");
    private static final IClasspathAttribute optionalAttribute = JavaCore.newClasspathAttribute(IClasspathAttribute.OPTIONAL, "true");

    @Override
    public boolean applies(IProject project) {
        return Utils.isGradleBuildServerProject(project);
    }

    public void updateClasspath(IProject project, IProgressMonitor monitor) throws CoreException {
        IPath rootPath = ProjectUtils.findBelongedWorkspaceRoot(project.getLocation());
        if (rootPath == null) {
            JavaLanguageServerPlugin.logError("Cannot find workspace root for project: " + project.getName());
            return;
        }
        BuildServer buildServer = ImporterPlugin.getBuildServerConnection(rootPath);
        List<IClasspathEntry> classpath = new LinkedList<>();
        WorkspaceBuildTargetsResult workspaceBuildTargetsResult = buildServer.workspaceBuildTargets().join();
        List<BuildTarget> allBuildTargets = workspaceBuildTargetsResult.getTargets();
        List<BuildTarget> buildTargets = Utils.getBuildTargetsByProjectUri(allBuildTargets, project.getLocationURI());
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
                classpath.addAll(sourceEntries);
            }

            String resourceOutputUri = getOutputUriByKind(outputResult.getItems(), "resource");
            IPath resourceOutputFullPath = getOutputFullPath(resourceOutputUri, project);
            // resource output is nullable according to Gradle API definition.
            if (resourceOutputFullPath != null) {
                ResourcesResult resourcesResult = buildServer.buildTargetResources(
                    new ResourcesParams(Arrays.asList(buildTarget.getId()))).join();
                List<IClasspathEntry> resourceEntries = getResourceEntries(project, resourcesResult, resourceOutputFullPath, isTest);
                classpath.addAll(resourceEntries);
            }

            // TODO: resolve other classpath entries.
        }

        if (classpath.stream().anyMatch(cp -> cp.getEntryKind() == IClasspathEntry.CPE_SOURCE)) {
            // if there is any source entry, we treat it as a Java project.
            addJavaNature(project, monitor);
            JavaCore.create(project).setRawClasspath(classpath.toArray(new IClasspathEntry[0]), monitor);
            // refresh to let JDT be aware of the output folders.
            // TODO: check if we only only refresh the output folder.
            project.refreshLocal(IResource.DEPTH_INFINITE, monitor);
        }
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
                        linkFolder.createLink(sourcePath, IResource.REPLACE, monitor);
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
     */
    private IPath getOutputFullPath(String outputUri, IProject project) {
        if (StringUtils.isBlank(outputUri)) {
            return null;
        }

        IPath sourceOutputPath = ResourceUtils.filePathFromURI(Utils.getUriWithoutQuery(outputUri).toString());
        File outputDirectory = sourceOutputPath.toFile();
        if (!outputDirectory.exists()) {
            outputDirectory.mkdirs();
        }
        IPath relativeSourceOutputPath = sourceOutputPath.makeRelativeTo(project.getLocation());
        return project.getFolder(relativeSourceOutputPath).getFullPath();
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

    /**
     * Add Java nature to project description if it doesn't have one.
     */
    private void addJavaNature(IProject project, IProgressMonitor monitor) throws CoreException {
        SubMonitor progress = SubMonitor.convert(monitor, 1);
        // get the description
        IProjectDescription description = project.getDescription();

        // abort if the project already has the nature applied or the nature is not defined
        List<String> currentNatureIds = Arrays.asList(description.getNatureIds());
        if (currentNatureIds.contains(JavaCore.NATURE_ID)) {
            return;
        }

        // add the nature to the project
        List<String> newIds = new LinkedList<>();
        newIds.addAll(currentNatureIds);
        newIds.add(0, JavaCore.NATURE_ID);
        description.setNatureIds(newIds.toArray(new String[newIds.size()]));

        // save the updated description
        // TODO: add JavaBuilder
        project.setDescription(description, IResource.AVOID_NATURE_CONFIG, progress.newChild(1));
    }

}
