package com.microsoft.gradle.bs.importer;

import java.io.File;
import java.io.IOException;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

import org.apache.commons.lang3.tuple.Pair;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.FileLocator;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Plugin;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.ls.core.internal.managers.DigestStore;
import org.eclipse.lsp4j.jsonrpc.Launcher;
import org.osgi.framework.BundleContext;

import com.microsoft.java.builder.BuildStateManager;

import ch.epfl.scala.bsp4j.BuildClient;

public class ImporterPlugin extends Plugin {

    public static final String PLUGIN_ID = "com.microsoft.gradle.buildServer.importer";

    private Map<IPath, Pair<BuildServerConnection, BuildClient>> buildServers = new ConcurrentHashMap<>();

    private static ImporterPlugin instance;

    /**
     * Digest store for the gradle configuration files.
     */
    private DigestStore digestStore;

    private static String bundleDirectory;

    @Override
    public void start(BundleContext context) throws Exception {
        BuildStateManager.getBuildStateManager().startup();
        ImporterPlugin.instance = this;
        digestStore = new DigestStore(getStateLocation().toFile());
        Optional<File> bundleFile = FileLocator.getBundleFileLocation(context.getBundle());
        if (!bundleFile.isPresent()) {
           throw new IllegalStateException("Failed to get bundle location.");
        }
        bundleDirectory = bundleFile.get().getParent();
    }

    @Override
    public void stop(BundleContext context) throws Exception {
        for (Pair<BuildServerConnection, BuildClient> pair : buildServers.values()) {
            pair.getLeft().buildShutdown();
            pair.getLeft().onBuildExit();
        }
    }

    public static ImporterPlugin getInstance() {
        return ImporterPlugin.instance;
    }

    public static DigestStore getDigestStore() {
        return instance.digestStore;
    }

    public static BuildServerConnection getBuildServerConnection(IPath rootPath) throws CoreException {
        Pair<BuildServerConnection, BuildClient> pair = instance.buildServers.get(rootPath);
        if (pair != null) {
            return pair.getLeft();
        }

        String javaExecutablePath = getJavaExecutablePath();
        String[] classpaths = getBuildServerClasspath();

        String pluginPath = getBuildServerPluginPath();

        ProcessBuilder build = new ProcessBuilder(
                javaExecutablePath,
                "--add-opens=java.base/java.lang=ALL-UNNAMED",
                "--add-opens=java.base/java.io=ALL-UNNAMED",
                "--add-opens=java.base/java.util=ALL-UNNAMED",
                "-Dplugin.dir=" + pluginPath,
                "-cp",
                String.join(getClasspathSeparator(), classpaths),
                "com.microsoft.java.bs.core.Launcher"
        );

        try {
            Process process = build.start();
            BuildClient client = new GradleBuildClient();
            Launcher<BuildServerConnection> launcher = new Launcher.Builder<BuildServerConnection>()
                    .setOutput(process.getOutputStream())
                    .setInput(process.getInputStream())
                    .setLocalService(client)
                    .setExecutorService(Executors.newCachedThreadPool())
                    .setRemoteInterface(BuildServerConnection.class)
                    .create();

            launcher.startListening();
            BuildServerConnection server = launcher.getRemoteProxy();
            client.onConnectWithServer(server);
            instance.buildServers.put(rootPath, Pair.of(server, client));
            return server;
        } catch (IOException e) {
            throw new CoreException(new Status(IStatus.ERROR, PLUGIN_ID,
                    "Failed to start build server.", e));
        }
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
