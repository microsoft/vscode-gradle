package com.microsoft.gradle.bs.importer;

import java.io.File;
import java.io.IOException;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

import org.apache.commons.lang3.tuple.Pair;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.FileLocator;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Plugin;
import org.eclipse.core.runtime.Status;
import org.eclipse.lsp4j.jsonrpc.Launcher;
import org.osgi.framework.BundleContext;

import ch.epfl.scala.bsp4j.BuildClient;
import ch.epfl.scala.bsp4j.BuildServer;

public class ImporterPlugin extends Plugin {

    public static final String PLUGIN_ID = "com.microsoft.gradle.buildServer.importer";

    private Map<IPath, Pair<BuildServer, BuildClient>> buildServers = new ConcurrentHashMap<>();

    private BuildTargetManager buildTargetManager = new BuildTargetManager();

    private static ImporterPlugin instance;

    private static String bundleDirectory;

    @Override
    public void start(BundleContext context) throws Exception {
        ImporterPlugin.instance = this;
        Optional<File> bundleFile = FileLocator.getBundleFileLocation(context.getBundle());
        if (!bundleFile.isPresent()) {
           throw new IllegalStateException("Failed to get bundle location.");
        }
        bundleDirectory = bundleFile.get().getParent();
    }

    @Override
    public void stop(BundleContext context) throws Exception {
        for (Pair<BuildServer, BuildClient> pair : buildServers.values()) {
            pair.getLeft().buildShutdown();
            pair.getLeft().onBuildExit();
        }
    }

    public static ImporterPlugin getInstance() {
        return ImporterPlugin.instance;
    }

    public static BuildServer getBuildServerConnection(IPath rootPath) throws CoreException {
        Pair<BuildServer, BuildClient> pair = instance.buildServers.get(rootPath);
        if (pair != null) {
            return pair.getLeft();
        }

        String javaExecutablePath = getJavaExecutablePath();
        String[] classpaths = getBuildServerClasspath();

        // TODO: if we decide to remove the file logger, the storage path can be removed.
        String storagePath = ResourcesPlugin.getWorkspace().getRoot().getLocation()
                    .removeLastSegments(2).append("build-server").toFile().getAbsolutePath();
        String pluginPath = getBuildServerPluginPath();

        ProcessBuilder build = new ProcessBuilder(
                javaExecutablePath,
                "--add-opens=java.base/java.lang=ALL-UNNAMED",
                "--add-opens=java.base/java.io=ALL-UNNAMED",
                "--add-opens=java.base/java.util=ALL-UNNAMED",
                "-Dserver.storage=" + storagePath,
                "-Dplugin.dir=" + pluginPath,
                "-cp",
                String.join(getClasspathSeparator(), classpaths),
                "com.microsoft.java.bs.core.Launcher"
        );

        try {
            Process process = build.start();
            BuildClient client = new GradleBuildClient();
            Launcher<BuildServer> launcher = new Launcher.Builder<BuildServer>()
                    .setOutput(process.getOutputStream())
                    .setInput(process.getInputStream())
                    .setLocalService(client)
                    .setExecutorService(Executors.newCachedThreadPool())
                    .setRemoteInterface(BuildServer.class)
                    .create();

            launcher.startListening();
            BuildServer server = launcher.getRemoteProxy();
            client.onConnectWithServer(server);
            instance.buildServers.put(rootPath, Pair.of(server, client));
            return server;
        } catch (IOException e) {
            throw new CoreException(new Status(IStatus.ERROR, PLUGIN_ID,
                    "Failed to start build server.", e));
        }
    }

    public static BuildTargetManager getBuildTargetManager() {
        return instance.buildTargetManager;
    }

    /**
     * Get the Java executable used by JDT.LS, which will be higher than JDK 17.
     */
    private static String getJavaExecutablePath() {
        Optional<String> command = ProcessHandle.current().info().command();
        if (command.isPresent()) {
            return command.get();
        }

        throw new IllegalStateException("Failed to get Java executable path.");
    }

    private static String[] getBuildServerClasspath() {
        return new String[]{
            Paths.get(bundleDirectory, "server.jar").toString(),
            Paths.get(bundleDirectory, "runtime").toString() + File.separatorChar + "*"
        };
    }

    private static String getBuildServerPluginPath() {
        return Paths.get(bundleDirectory, "plugins").toString();
    }

    private static String getClasspathSeparator() {
        String os = System.getProperty("os.name").toLowerCase();

        if (os.contains("win")) {
            return ";";
        }

        return ":"; // Linux or Mac
    }
}
