package com.github.badsyntax.gradletasks;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.logging.ConsoleHandler;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.logging.StreamHandler;

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonArray;

import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ModelBuilder;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.model.GradleProject;

public class CliApp {
    private File sourceDir;
    private File targetFile;
    private Logger logger;
    private LoggerOutputStream loggerOutputStream;

    public CliApp(File sourceDir, File targetFile, Logger logger) {
        this.sourceDir = sourceDir;
        this.targetFile = targetFile;
        this.logger = logger;
        this.loggerOutputStream = new LoggerOutputStream(logger);
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

        StreamHandler logHandler = new ConsoleHandler();
        logHandler.setFormatter(new BasicWriteFormatter());
        logHandler.setLevel(Level.ALL);

        Logger logger = Logger.getLogger(CliApp.class.getName());
        logger.setUseParentHandlers(false);
        logger.addHandler(logHandler);

        try {
            CliApp app = new CliApp(sourceDir, targetFile, logger);
            app.writeTasksToFile();
        } catch(CliAppException ex) {
            logger.info(ex.getMessage());
            System.exit(1);
        }
    }

    private void writeTasksToFile() throws IOException, CliAppException {
        JsonArray tasks = getTasks();
        String jsonString = tasks.toString();
        try (FileOutputStream outputStream = new FileOutputStream(targetFile)) {
            byte[] strToBytes = jsonString.getBytes();
            outputStream.write(strToBytes);
        }
    }

    private JsonArray getTasks() throws CliAppException {
        JsonArray jsonTasks = Json.array();
        GradleProgressListener progressListener = new GradleProgressListener(this.logger);
        ProjectConnection connection = GradleConnector.newConnector().forProjectDirectory(sourceDir).connect();
        try {
            ModelBuilder<GradleProject> rootProjectBuilder = connection.model(GradleProject.class);
            rootProjectBuilder.addProgressListener(progressListener);
            rootProjectBuilder.setStandardOutput(loggerOutputStream);
            rootProjectBuilder.setStandardError(loggerOutputStream);
            rootProjectBuilder.setColorOutput(true);
            GradleProject rootProject = rootProjectBuilder.get();
            rootProject.getTasks().stream()
                    .map(task -> Json.object().add("name", task.getName()).add("group", task.getGroup())
                            .add("path", task.getPath()).add("project", task.getProject().getName())
                            .add("buildFile", task.getProject().getBuildScript().getSourceFile().getAbsolutePath())
                            .add("rootProject", rootProject.getName()).add("description", task.getDescription()))
                    .forEach(jsonTasks::add);
        } catch (Exception err) {
            throw new CliAppException(err.getMessage());
        } finally {
            connection.close();
        }
        return jsonTasks;
    }
}
