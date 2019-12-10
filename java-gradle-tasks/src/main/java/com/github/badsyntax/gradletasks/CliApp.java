package com.github.badsyntax.gradletasks;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.logging.ConsoleHandler;
import java.util.logging.Formatter;
import java.util.logging.Level;
import java.util.logging.LogRecord;
import java.util.logging.Logger;
import java.util.logging.StreamHandler;
import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonArray;
import org.gradle.tooling.GradleConnectionException;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProgressEvent;
import org.gradle.tooling.ProgressListener;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.model.GradleProject;
import org.gradle.tooling.model.gradle.GradleBuild;
import org.gradle.tooling.model.gradle.GradleScript;

public class CliApp {
    private File sourceDir;
    private File targetFile;
    private Logger logger;
    private ProgressListener progressListener;

    public CliApp(File sourceDir, File targetFile) {
        this.sourceDir = sourceDir;
        this.targetFile = targetFile;

        StreamHandler handler = new ConsoleHandler();
        handler.setFormatter(new BasicWriteFormatter());
        handler.setLevel(Level.ALL);

        this.logger = Logger.getLogger("CliApp");
        this.logger.setUseParentHandlers(false);
        this.logger.addHandler(handler);

        this.progressListener = new ProgressListener() {
            @Override
            public void statusChanged(ProgressEvent progressEvent) {
                logger.info(".");
            }
        };
    }

    private static class BasicWriteFormatter extends Formatter {
        @Override
        public String format(LogRecord record) {
            return record.getMessage();
        }
    }

    public static void main(String[] args) throws CliAppException, IOException {
        if (args.length < 2) {
            throw new CliAppException("No source directory and/or target file specified");
        }
        String dirName = args[0];
        File sourceDir = new File(dirName);
        if (!sourceDir.exists()) {
            throw new CliAppException("Source directory does not exist");
        }
        String targetFileName = args[1];
        File targetFile = new File(targetFileName);
        CliApp app = new CliApp(sourceDir, targetFile);
        app.writeProjectsToFile();
    }

    private void writeProjectsToFile() throws IOException, CliAppException {
        JsonArray projects = getProjects();
        String jsonString = projects.toString();
        try (FileOutputStream outputStream = new FileOutputStream(targetFile)) {
            byte[] strToBytes = jsonString.getBytes();
            outputStream.write(strToBytes);
        }
        String lineSep = System.lineSeparator();
        String absolutePath = targetFile.getAbsolutePath();
        logger.info(String.format("%sSuccessfully written: %s%s", lineSep, absolutePath, lineSep));
    }

    private JsonArray getProjects() throws CliAppException {
        JsonArray jsonProjects = Json.array();
        ProjectConnection connection = null;
        GradleBuild rootBuild;
        GradleProject rootProject;

        try {
            connection = GradleConnector.newConnector().forProjectDirectory(sourceDir).connect();
            ModelBuilder<GradleBuild> rootBuilder = connection.model(GradleBuild.class);
            rootBuilder.addProgressListener(progressListener);
            rootBuilder.setStandardOutput(System.out);
            rootBuilder.setStandardError(System.out);
            rootBuild = rootBuilder.get();

            ModelBuilder<GradleProject> rootProjectBuilder = connection.model(GradleProject.class);
            rootProjectBuilder.addProgressListener(progressListener);
            rootProjectBuilder.setStandardOutput(System.out);
            rootProjectBuilder.setStandardError(System.out);
            rootProject = rootProjectBuilder.get();
        } catch (GradleConnectionException err) {
            if (connection != null) {
                connection.close();
            }
            throw new CliAppException(err.getMessage());
        }

        rootBuild.getProjects().stream().map(project -> {
            GradleProject gradleProject = rootProject.findByPath(project.getPath());

            JsonArray jsonTasks = Json.array();

            gradleProject.getTasks().stream()
                    .map(task -> Json.object().add("name", task.getName())
                            .add("group", task.getGroup()).add("path", task.getPath())
                            .add("project", gradleProject.getName())
                            .add("description", task.getDescription()))
                    .forEach(jsonTasks::add);

            GradleProject parentProject = gradleProject.getParent();
            GradleScript buildScript = gradleProject.getBuildScript();
            String parentProjectName = parentProject != null ? parentProject.getName() : null;

            return Json.object().add("name", gradleProject.getName())
                    .add("parent", parentProjectName).add("path", gradleProject.getPath())
                    .add("buildFile", buildScript.getSourceFile().getAbsolutePath())
                    .add("tasks", jsonTasks);
        }).forEach(jsonProjects::add);

        connection.close();
        return jsonProjects;
    }
}
