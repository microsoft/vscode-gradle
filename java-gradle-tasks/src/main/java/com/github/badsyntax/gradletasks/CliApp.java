package com.github.badsyntax.gradletasks;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonArray;

import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.model.GradleProject;
import org.gradle.tooling.model.gradle.GradleBuild;

public class CliApp {
    private File sourceDir;
    private File targetFile;

    public CliApp(File sourceDir, File targetFile) {
        this.sourceDir = sourceDir;
        this.targetFile = targetFile;
    }

    public static void main(String[] args) throws IOException {
        if (args.length < 2) {
            throw new RuntimeException("No source directory and/or target file specified");
        }
        String dirName = args[0];
        File sourceDir = new File(dirName);
        if (!sourceDir.exists()) {
            throw new RuntimeException("Source directory does not exist");
        }
        String targetFileName = args[1];
        File targetFile = new File(targetFileName);
        CliApp app = new CliApp(sourceDir, targetFile);
        app.writeProjectsToFile();
    }

    private void writeProjectsToFile() throws IOException {
        JsonArray projects = getProjects();
        String jsonString = projects.toString();
        FileOutputStream outputStream = new FileOutputStream(targetFile);
        byte[] strToBytes = jsonString.getBytes();
        outputStream.write(strToBytes);
        outputStream.close();
    }

    private JsonArray getProjects() {
        ProjectConnection connection =
                GradleConnector.newConnector().forProjectDirectory(sourceDir).connect();
        GradleBuild rootBuild = connection.model(GradleBuild.class).get();
        GradleProject rootProject = connection.model(GradleProject.class).get();
        JsonArray jsonProjects = Json.array();

        rootBuild.getProjects().stream().map(project -> {
            GradleProject gradleProject = rootProject.findByPath(project.getPath());

            JsonArray jsonTasks = Json.array();

            gradleProject.getTasks().stream().map(task -> {
                return Json.object().add("name", task.getName()).add("group", task.getGroup())
                        .add("path", task.getPath()).add("project", gradleProject.getName())
                        .add("description", task.getDescription());
            }).forEach(jsonTasks::add);

            GradleProject parentProject = gradleProject.getParent();
            String parentProjectName = parentProject != null ? parentProject.getName() : null;

            return Json.object().add("name", gradleProject.getName())
                    .add("parent", parentProjectName).add("path", gradleProject.getPath())
                    .add("tasks", jsonTasks);
        }).forEach(jsonProjects::add);
        connection.close();
        return jsonProjects;
    }
}
