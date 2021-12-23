// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle;

import com.microsoft.gradle.api.GradleClosure;
import com.microsoft.gradle.api.GradleDependencyNode;
import com.microsoft.gradle.api.GradleDependencyType;
import com.microsoft.gradle.api.GradleField;
import com.microsoft.gradle.api.GradleMethod;
import com.microsoft.gradle.api.GradleProjectModel;
import java.lang.annotation.Annotation;
import java.lang.reflect.AccessibleObject;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.gradle.api.Project;
import org.gradle.api.artifacts.Configuration;
import org.gradle.api.artifacts.ConfigurationContainer;
import org.gradle.api.artifacts.ResolvableDependencies;
import org.gradle.api.artifacts.result.DependencyResult;
import org.gradle.api.artifacts.result.ResolutionResult;
import org.gradle.api.artifacts.result.ResolvedComponentResult;
import org.gradle.api.artifacts.result.ResolvedDependencyResult;
import org.gradle.api.initialization.dsl.ScriptHandler;
import org.gradle.api.internal.initialization.DefaultScriptHandler;
import org.gradle.api.plugins.Convention;
import org.gradle.api.plugins.ExtensionsSchema;
import org.gradle.api.plugins.ExtensionsSchema.ExtensionSchema;
import org.gradle.api.reflect.TypeOf;
import org.gradle.api.tasks.JavaExec;
import org.gradle.api.tasks.TaskContainer;
import org.gradle.api.tasks.testing.Test;
import org.gradle.internal.classpath.ClassPath;
import org.gradle.tooling.provider.model.ToolingModelBuilder;

public class GradleProjectModelBuilder implements ToolingModelBuilder {
	public boolean canBuild(String modelName) {
		return modelName.equals(GradleProjectModel.class.getName());
	}

	public Object buildAll(String modelName, Project project) {
		ScriptHandler buildScript = project.getBuildscript();
		ClassPath classpath = ((DefaultScriptHandler) buildScript).getScriptClassPath();
		List<String> scriptClasspaths = new ArrayList<>();
		classpath.getAsFiles().forEach((file) -> {
			scriptClasspaths.add(file.getAbsolutePath());
		});
		GradleDependencyNode node = generateDefaultGradleDependencyNode(project);
		List<String> plugins = getPlugins(project);
		List<GradleClosure> closures = getPluginClosures(project);
		List<String> debugTasks = getDebugTasks(project);
		return new DefaultGradleProjectModel(node, plugins, closures, scriptClasspaths, debugTasks);
	}

	private GradleDependencyNode generateDefaultGradleDependencyNode(Project project) {
		DefaultGradleDependencyNode rootNode = new DefaultGradleDependencyNode(project.getName(),
				GradleDependencyType.PROJECT);
		ConfigurationContainer configurationContainer = project.getConfigurations();
		for (String configName : configurationContainer.getNames()) {
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

	private boolean isDeprecated(AccessibleObject object) {
		for (Annotation annotation : object.getDeclaredAnnotations()) {
			if (annotation.toString().contains("Deprecated")) {
				return true;
			}
		}
		return false;
	}

	private List<String> getDebugTasks(Project project) {
		List<String> results = new ArrayList<>();
		TaskContainer taskContainer = project.getTasks();
		taskContainer.withType(JavaExec.class).forEach(task -> results.add(task.getPath()));
		taskContainer.withType(Test.class).forEach(task -> results.add(task.getPath()));
		return results;
	}
}
