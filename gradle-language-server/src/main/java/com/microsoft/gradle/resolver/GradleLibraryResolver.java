// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.resolver;

import com.microsoft.gradle.manager.GradleFilesManager;
import com.microsoft.gradle.utils.Utils;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URL;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import org.apache.bcel.classfile.ClassFormatException;
import org.apache.bcel.classfile.ClassParser;
import org.apache.bcel.classfile.Field;
import org.apache.bcel.classfile.JavaClass;

public class GradleLibraryResolver {

	private class DistInfo {
		public Path distsPath;
		public String distName;

		public DistInfo(Path distsPath, String distName) {
			this.distsPath = distsPath;
			this.distName = distName;
		}
	}

	private static String JAVA_PLUGIN = "org.gradle.api.plugins.JavaPlugin";

	private GradleFilesManager gradleFilesManager;
	private Map<String, JavaClass> gradleClasses = new HashMap<>();
	private Set<String> javaConfigurations = new HashSet<>();
	private Set<String> javaPlugins = new HashSet<>();
	// <projectPath, pluginsList>
	private Map<String, List<String>> projectPlugins = new HashMap<>();
	// <projectPath, closureList>
	private Map<String, List<GradleClosure>> extClosures = new HashMap<>();
	private String gradleHome;
	private String gradleVersion;
	private boolean gradleWrapperEnabled;
	private Path workspacePath;
	private File coreAPI;
	private File pluginAPI;
	private boolean needToLoadClasses;
	private Path gradleUserHomePath;

	public GradleLibraryResolver(GradleFilesManager gradleFilesManager) {
		this.gradleFilesManager = gradleFilesManager;
		this.javaPlugins.addAll(Arrays.asList("java", "application", "groovy", "java-library", "war"));
		this.needToLoadClasses = true;
		this.gradleUserHomePath = Paths.get(System.getProperty("user.home"), ".gradle");
	}

	public void setGradleHome(String gradleHome) {
		this.gradleHome = gradleHome;
	}

	public void setGradleVersion(String gradleVersion) {
		this.gradleVersion = gradleVersion;
	}

	public void setGradleWrapperEnabled(Boolean gradleWrapperEnabled) {
		this.gradleWrapperEnabled = gradleWrapperEnabled == null ? true : gradleWrapperEnabled;
	}

	public void setGradleUserHomePath(String gradleUserHome) {
		this.gradleUserHomePath = (gradleUserHome != null)
				? Paths.get(gradleUserHome)
				: Paths.get(System.getProperty("user.home"), ".gradle");
	}

	public void setWorkspacePath(Path workspacePath) {
		this.workspacePath = workspacePath;
	}

	public Map<String, JavaClass> getGradleClasses() {
		return this.gradleClasses;
	}

	public Set<String> getJavaConfigurations() {
		return this.javaConfigurations;
	}

	public List<GradleClosure> getExtClosures(String projectPath) {
		return this.extClosures.get(projectPath);
	}

	public boolean resolveGradleAPI() {
		return resolveGradleAPI(null);
	}

	public boolean resolveGradleAPI(URI gradleFilePath) {
		this.needToLoadClasses = true;
		// step 1: find "lib" folder
		File libFolder = null;
		if (this.gradleWrapperEnabled) {
			DistInfo info = getWrapperPropertiesInfo(gradleFilePath);
			if (info == null) {
				return false;
			}
			libFolder = findLibFolder(info);
		} else if (this.gradleVersion != null) {
			Path distsPath = this.gradleUserHomePath.resolve(Paths.get("wrapper", "dists"));
			String distName = "gradle-" + this.gradleVersion;
			libFolder = findLibFolder(new DistInfo(distsPath, distName));
		} else if (this.gradleHome != null) {
			libFolder = Paths.get(this.gradleHome).resolve("lib").toFile();
		}
		if (!Utils.isValidFolder(libFolder)) {
			return false;
		}
		File newAPI = findCoreAPI(libFolder);
		if (!Utils.isValidFile(newAPI)) {
			return false;
		}
		if (this.coreAPI != null && this.coreAPI.equals(newAPI)) {
			// same gradle dist so reuse.
			this.needToLoadClasses = false;
			return false;
		}

		this.gradleFilesManager.setGradleLibraries(Utils.listAllFiles(libFolder));
		// step 2: find core API jar file
		this.coreAPI = newAPI;
		// step 3: find plugin API jar file
		this.pluginAPI = findPluginAPI(this.coreAPI.toPath().getParent().resolve(Paths.get("plugins")).toFile());
		return Utils.isValidFile(this.pluginAPI);
	}

	public void loadGradleClasses(URI uri) {
		boolean isAPIValid = Utils.isValidFile(this.coreAPI) && Utils.isValidFile(this.pluginAPI);
		if (!this.needToLoadClasses || (!isAPIValid && !this.resolveGradleAPI(uri))) {
			return;
		}
		try {
			JarFile coreAPIJar = new JarFile(this.coreAPI);
			loadClasses(this.coreAPI.toPath(), coreAPIJar);
			JarFile pluginAPIJar = new JarFile(this.pluginAPI);
			loadClasses(this.pluginAPI.toPath(), pluginAPIJar);
			loadJavaConfigurations();
			this.needToLoadClasses = false;
		} catch (Exception e) {
			// Do Nothing
		}
	}

	private DistInfo getWrapperPropertiesInfo(URI gradleFilePath) {
		if (this.workspacePath == null && gradleFilePath == null) {
			return null;
		}
		Path propertiesRelativePath = Paths.get("gradle", "wrapper", "gradle-wrapper.properties");
		Path propertiesPath = null;
		if (gradleFilePath != null) {
			propertiesPath = Paths.get(gradleFilePath).getParent().resolve(propertiesRelativePath);
		} else {
			propertiesPath = this.workspacePath.resolve(propertiesRelativePath);
		}

		File propertiesFile = propertiesPath.toFile();
		if (!propertiesFile.exists()) {
			return null;
		}
		Properties properties = new Properties();
		try (FileInputStream stream = new FileInputStream(propertiesFile)) {
			properties.load(stream);
			String distributionBaseValue = properties.getProperty("distributionBase");
			// We use default values if the properties are not specified
			// See:
			// https://docs.gradle.org/current/dsl/org.gradle.api.tasks.wrapper.Wrapper.html#N30F30
			if (distributionBaseValue == null) {
				distributionBaseValue = "GRADLE_USER_HOME";
			}
			Path distributionBase = getDistributionBase(distributionBaseValue);
			if (distributionBase == null) {
				return null;
			}
			String distributionPath = properties.getProperty("distributionPath");
			if (distributionPath == null) {
				distributionPath = "wrapper/dists";
			}
			Path distPath = distributionBase.resolve(distributionPath);
			String distributionUrl = properties.getProperty("distributionUrl");
			// if distributionUrl is not specified, the import process will not be
			// successful
			if (distributionUrl == null) {
				return null;
			}
			Path fileName = Paths.get(new URL(distributionUrl).getPath()).getFileName();
			return new DistInfo(distPath, Utils.getFileNameWithoutExtension(fileName));
		} catch (IOException e) {
			return null;
		}
	}

	private File findLibFolder(DistInfo info) {
		File distFolder = info.distsPath.toFile();
		// distFolder matches .gradle/wrapper/dists
		if (!Utils.isValidFolder(distFolder)) {
			return null;
		}
		File targetFolder = Utils.findSubFolder(distFolder, info.distName);
		// targetFolder matches .gradle/wrapper/dists/${gradleDist}
		if (!Utils.isValidFolder(targetFolder)) {
			return null;
		}
		for (File internalValueFolder : targetFolder.listFiles()) {
			if (Utils.isValidFolder(internalValueFolder)) {
				// internalValueFolder matches
				// .gradle/wrapper/dists/${gradleDist}/internal-string
				for (File extractFolder : internalValueFolder.listFiles()) {
					// extractFolder matches
					// .gradle/wrapper/dists/${gradleDist}/internal-string/${gradleVersion}
					if (Utils.isValidFolder(extractFolder)) {
						// matches
						// .gradle/wrapper/dists/${gradleDist}/internal-string/${gradleVersion}/lib
						return extractFolder.toPath().resolve("lib").toFile();
					}
				}
			}
		}
		return null;
	}

	private File findCoreAPI(File folder) {
		for (File file : folder.listFiles()) {
			String name = file.getName();
			if (name.startsWith("gradle-core-api") && name.endsWith(".jar")) {
				return file;
			}
		}
		// For Gradle version under 5.6, the name of library file is like
		// gradle-core-${version}.jar
		for (File file : folder.listFiles()) {
			String name = file.getName();
			if (name.startsWith("gradle-core") && name.endsWith(".jar")) {
				return file;
			}
		}
		return null;
	}

	private File findPluginAPI(File folder) {
		for (File file : folder.listFiles()) {
			String name = file.getName();
			if (name.startsWith("gradle-plugins") && name.endsWith(".jar")) {
				return file;
			}
		}
		return null;
	}

	private void loadClasses(Path jarPath, JarFile jarFile) {
		Enumeration<JarEntry> entries = jarFile.entries();
		while (entries.hasMoreElements()) {
			JarEntry entry = entries.nextElement();
			if (!entry.getName().endsWith(".class")) {
				continue;
			}
			ClassParser parser = new ClassParser(jarPath.toString(), entry.getName());
			try {
				JavaClass javaClass = parser.parse();
				String className = javaClass.getClassName();
				this.gradleClasses.put(className, javaClass);
			} catch (IOException | ClassFormatException e) {
				// Do Nothing
			}
		}
	}

	private void loadJavaConfigurations() {
		JavaClass javaPluginClass = this.gradleClasses.get(GradleLibraryResolver.JAVA_PLUGIN);
		if (javaPluginClass == null) {
			return;
		}
		for (Field field : javaPluginClass.getFields()) {
			if (field.getName().endsWith("CONFIGURATION_NAME")) {
				this.javaConfigurations.add(removeQuotes(field.getConstantValue().toString()));
			}
		}
	}

	public void setExtClosures(String projectPath, List<GradleClosure> closures) {
		this.extClosures.put(projectPath, closures);
	}

	private static String removeQuotes(String original) {
		// for those fields parsed from class files, we get ""values"", so we remove the
		// starting and ending quotes here
		if (original.length() < 3) {
			return original;
		}
		return original.substring(1, original.length() - 1);
	}

	public void setProjectPlugins(String projectPath, List<String> plugins) {
		this.projectPlugins.put(projectPath, plugins);
	}

	public boolean isJavaPluginsIncluded(URI uri, Set<String> plugins) {
		String folderPath = Utils.getFolderPath(uri);
		if (folderPath != null) {
			List<String> pluginsList = this.projectPlugins.get(folderPath);
			if (pluginsList != null && pluginsList.contains("java")) {
				return true;
			}
		}
		for (String plugin : plugins) {
			if (this.javaPlugins.contains(plugin)) {
				return true;
			}
		}
		return false;
	}

	private Path getDistributionBase(String distributionBase) {
		// See:
		// https://docs.gradle.org/current/javadoc/org/gradle/api/tasks/wrapper/Wrapper.PathBase.html
		if (distributionBase.equals("GRADLE_USER_HOME")) {
			return this.gradleUserHomePath;
		} else if (distributionBase.equals("PROJECT")) {
			return this.workspacePath;
		}
		return null;
	}
}
