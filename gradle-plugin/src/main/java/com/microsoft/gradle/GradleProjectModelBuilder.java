// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.microsoft.gradle.api.GradleClosure;
import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleDependencyType;
import com.microsoft.gradle.api.GradleField;
import com.microsoft.gradle.api.GradleMethod;
import com.microsoft.gradle.api.GradleProjectModel;
import com.microsoft.gradle.api.GradleTask;
import java.lang.annotation.Annotation;
import java.lang.reflect.AccessibleObject;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.gradle.api.Project;
import org.gradle.api.Task;
import org.gradle.api.artifacts.Configuration;
import org.gradle.api.artifacts.ConfigurationContainer;
import org.gradle.api.artifacts.ResolvableDependencies;
import org.gradle.api.artifacts.result.DependencyResult;
import org.gradle.api.artifacts.result.ResolutionResult;
import org.gradle.api.artifacts.result.ResolvedComponentResult;
import org.gradle.api.artifacts.result.ResolvedDependencyResult;
import org.gradle.api.initialization.dsl.ScriptHandler;
import org.gradle.api.internal.initialization.DefaultScriptHandler;
import org.gradle.api.internal.tasks.TaskContainerInternal;
import org.gradle.api.plugins.Convention;
import org.gradle.api.plugins.ExtensionsSchema;
import org.gradle.api.plugins.ExtensionsSchema.ExtensionSchema;
import org.gradle.api.reflect.TypeOf;
import org.gradle.api.tasks.JavaExec;
import org.gradle.api.tasks.TaskContainer;
import org.gradle.api.tasks.testing.Test;
import org.gradle.internal.classpath.ClassPath;
import org.gradle.plugins.ide.internal.tooling.model.DefaultGradleProject;
import org.gradle.tooling.provider.model.ToolingModelBuilder;
import org.gradle.tooling.provider.model.ToolingModelBuilderRegistry;
import org.gradle.util.GradleVersion;

public class GradleProjectModelBuilder implements ToolingModelBuilder {

	private static String MINIMAL_SUPPORTED_PLUGIN_CLOSURE_VERSION = "5.0";

	private Set<GradleTask> cachedTasks = new HashSet<>();
	private ToolingModelBuilderRegistry registry;

	public GradleProjectModelBuilder(ToolingModelBuilderRegistry registry) {
		this.registry = registry;
	}

	public boolean canBuild(String modelName) {
		return modelName.equals(GradleProjectModel.class.getName());
	}

	public Object buildAll(String modelName, Project project) {
		cachedTasks.clear();
		DefaultGradleProject gradleProject = (DefaultGradleProject) this.registry
				.getBuilder("org.gradle.tooling.model.GradleProject").buildAll(modelName, project);
		if (gradleProject == null) {
			return null;
		}
		GradleProjectModel rootModel = buildModel(project, project.getName(), gradleProject);
		// add task selectors for root project
		Set<String> taskNames = new HashSet<>();
		for (GradleTask existingTask : rootModel.getTasks()) {
			taskNames.add(existingTask.getName());
		}
		for (GradleTask task : cachedTasks) {
			if (!taskNames.contains(task.getName())) {
				taskNames.add(task.getName());
				String path = task.getPath();
				int index = path.lastIndexOf(":");
				if (index > -1) {
					// use task selector to run a task for all subprojects
					path = path.substring(index);
				}
				GradleTask newTask = new DefaultGradleTask(task.getName(), task.getGroup(), path, project.getName(),
						project.getBuildscript().getSourceFile().getAbsolutePath(), task.getRootProject(),
						task.getDescription(), task.getDebuggable());
				rootModel.getTasks().add(newTask);
			}
		}
		return rootModel;
	}

	private GradleProjectModel buildModel(Project project, String rootProjectName, DefaultGradleProject gradleProject) {
		if (project == null) {
			return null;
		}
		ScriptHandler buildScript = project.getBuildscript();
		ClassPath classpath = ((DefaultScriptHandler) buildScript).getScriptClassPath();
		List<String> scriptClasspaths = new ArrayList<>();
		classpath.getAsFiles().forEach((file) -> {
			scriptClasspaths.add(file.getAbsolutePath());
		});
		GradleDependencyNode node = generateDefaultGradleDependencyNode(project);
		List<String> plugins = getPlugins(project);
		List<GradleClosure> closures = getPluginClosures(project);
		List<GradleProjectModel> subModels = new ArrayList<>();
		for (DefaultGradleProject subDefaultGradleProject : gradleProject.getChildren()) {
			// Query sub projects when both gradleProject and project contain them
			Map<String, Project> childProjects = project.getChildProjects();
			String projectName = subDefaultGradleProject.getName();
			if (childProjects.keySet().contains(projectName)) {
				GradleProjectModel subModel = buildModel(childProjects.get(projectName), rootProjectName,
						subDefaultGradleProject);
				if (subModel != null) {
					subModels.add(subModel);
				}
			}
		}
		List<GradleTask> tasks = getGradleTasks(project, rootProjectName, gradleProject);
		return new DefaultGradleProjectModel(project.getParent() == null, project.getProjectDir().getAbsolutePath(),
				subModels, tasks, node, plugins, closures, scriptClasspaths);
	}

	private GradleDependencyNode generateDefaultGradleDependencyNode(Project project) {
		DefaultGradleDependencyNode rootNode = new DefaultGradleDependencyNode(project.getName(),
				GradleDependencyType.PROJECT);
		ConfigurationContainer configurationContainer = project.getConfigurations();
		// iterate through a snapshot of apparent configurations, because resolving
		// dependencies can trigger plugins dynamically adding other configurations
		// (e.g. io.quarkus plugin)
		for (String configName : new TreeSet<>(configurationContainer.getNames())) {
			Configuration config = configurationContainer.getByName(configName);
			if (!config.isCanBeResolved()) {
				continue;
			}
			DefaultGradleDependencyNode configNode = new DefaultGradleDependencyNode(config.getName(),
					GradleDependencyType.CONFIGURATION);
			ResolvableDependencies incoming = config.getIncoming();
			ResolutionResult resolutionResult = incoming.getResolutionResult();
			ResolvedComponentResult rootResult = resolutionResult.getRoot();
			Set<? extends DependencyResult> dependencies = rootResult.getDependencies();
			Set<String> dependencySet = new HashSet<>();
			for (DependencyResult dependency : dependencies) {
				if (dependency instanceof ResolvedDependencyResult) {
					DefaultGradleDependencyNode dependencyNode = resolveDependency(
							(ResolvedDependencyResult) dependency, dependencySet);
					configNode.addChildren(dependencyNode);
				}
			}
			if (!configNode.getChildren().isEmpty()) {
				rootNode.addChildren(configNode);
			}
		}
		return rootNode;
	}

	private DefaultGradleDependencyNode resolveDependency(ResolvedDependencyResult result, Set<String> dependencySet) {
		DefaultGradleDependencyNode dependencyNode = new DefaultGradleDependencyNode(
				result.getSelected().getModuleVersion().getGroup() + ":"
						+ result.getSelected().getModuleVersion().getName() + ":"
						+ result.getSelected().getModuleVersion().getVersion(),
				GradleDependencyType.DEPENDENCY);
		if (dependencySet.add(dependencyNode.getName())) {
			Set<? extends DependencyResult> dependencies = result.getSelected().getDependencies();
			for (DependencyResult dependency : dependencies) {
				if (dependency instanceof ResolvedDependencyResult) {
					DefaultGradleDependencyNode childNode = resolveDependency((ResolvedDependencyResult) dependency,
							dependencySet);
					dependencyNode.addChildren(childNode);
				}
			}
		}
		return dependencyNode;
	}

	private List<String> getPlugins(Project project) {
		Convention convention = project.getConvention();
		return new ArrayList<>(convention.getPlugins().keySet());
	}

	private List<GradleClosure> getPluginClosures(Project project) {
		if (GradleVersion.version(project.getGradle().getGradleVersion())
				.compareTo(GradleVersion.version(MINIMAL_SUPPORTED_PLUGIN_CLOSURE_VERSION)) < 0) {
			return Collections.emptyList();
		}
		Convention convention = project.getConvention();
		ExtensionsSchema extensionsSchema = convention.getExtensionsSchema();
		List<GradleClosure> closures = new ArrayList<>();
		for (ExtensionSchema schema : extensionsSchema.getElements()) {
			TypeOf<?> publicType = schema.getPublicType();
			Class<?> concreteClass = publicType.getConcreteClass();
			List<GradleMethod> methods = new ArrayList<>();
			List<GradleField> fields = new ArrayList<>();
			for (Method method : concreteClass.getMethods()) {
				String name = method.getName();
				List<String> parameterTypes = new ArrayList<>();
				for (Class<?> parameterType : method.getParameterTypes()) {
					parameterTypes.add(parameterType.getName());
				}
				methods.add(new DefaultGradleMethod(name, parameterTypes, isDeprecated(method)));
				int modifiers = method.getModifiers();
				// See:
				// https://docs.gradle.org/current/userguide/custom_gradle_types.html#managed_properties
				// we offer managed properties for an abstract getter method
				if (name.startsWith("get") && name.length() > 3 && Modifier.isPublic(modifiers)
						&& Modifier.isAbstract(modifiers)) {
					fields.add(new DefaultGradleField(name.substring(3, 4).toLowerCase() + name.substring(4),
							isDeprecated(method)));
				}
			}
			for (Field field : concreteClass.getFields()) {
				fields.add(new DefaultGradleField(field.getName(), isDeprecated(field)));
			}
			DefaultGradleClosure closure = new DefaultGradleClosure(schema.getName(), methods, fields);
			closures.add(closure);
		}
		return closures;
	}

	/**
	 * get Task information from the given models. DefaultGradleProject is used to
	 * get task list and Project is used to get debug information.
	 *
	 * @param project
	 *            the given org.gradle.api.Project model
	 * @param rootProjectName
	 *            the root project name
	 * @param gradleProject
	 *            the given
	 *            org.gradle.plugins.ide.internal.tooling.model.DefaultGradleProject
	 *            model
	 * @return the task list of the corresponding project
	 */
	private List<GradleTask> getGradleTasks(Project project, String rootProjectName,
			DefaultGradleProject gradleProject) {
		List<GradleTask> tasks = new ArrayList<>();
		gradleProject.getTasks().forEach((task) -> {
			String group = task.getGroup() == null ? null : task.getGroup();
			String description = task.getDescription() == null ? null : task.getDescription();
			GradleTask newTask = new DefaultGradleTask(task.getName(), group, task.getPath(), gradleProject.getName(),
					gradleProject.getBuildScript().getSourceFile().getAbsolutePath(), rootProjectName, description,
					false);
			tasks.add(newTask);
			cachedTasks.add(newTask);
		});
		for (GradleTask gradleTask : tasks) {
			// try to fetch debug information
			TaskContainer taskContainer = project.getTasks();
			if (taskContainer instanceof TaskContainerInternal) {
				TaskContainerInternal taskContainerInternal = (TaskContainerInternal) taskContainer;
				taskContainerInternal.discoverTasks();
				taskContainerInternal.realize();
				try {
					Task task = taskContainerInternal.getByName(gradleTask.getName());
					if ((task instanceof JavaExec || task instanceof Test)
							&& (gradleTask instanceof DefaultGradleTask)) {
						((DefaultGradleTask) gradleTask).setDebuggable(true);
					}
				} catch (Exception e) {
					// for lazy tasks, `getByName()` will return an exception in some cases, we
					// ignore them here
					continue;
				}
			}
		}
		return tasks;
	}

	private boolean isDeprecated(AccessibleObject object) {
		for (Annotation annotation : object.getDeclaredAnnotations()) {
			if (annotation.toString().contains("Deprecated")) {
				return true;
			}
		}
		return false;
	}
}
