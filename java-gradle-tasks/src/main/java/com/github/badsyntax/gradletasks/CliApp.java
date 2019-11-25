package com.github.badsyntax.gradletasks;

import java.io.File;

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonArray;

import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;
import org.gradle.tooling.model.GradleProject;
import org.gradle.tooling.model.gradle.GradleBuild;
import org.gradle.tooling.model.gradle.GradleScript;

public class CliApp {
    private File dir;

    public CliApp(File dir) {
        this.dir = dir;
    }

    public static void main(String[] args) {
        if (args.length == 0) {
            throw new RuntimeException("No directory specified");
        }
        String dirName = args[0];
        File dir = new File(dirName);
        if (!dir.exists()) {
            throw new RuntimeException("Directory does not exist");
        }
        new CliApp(dir).printJson();
    }

    private void printJson() {
        ProjectConnection connection = GradleConnector.newConnector().forProjectDirectory(dir).connect();
        GradleBuild rootBuild = connection.model(GradleBuild.class).get();
        // rootBuild.setBuildFile(new File("foo"));

        GradleProject rootProject = connection.model(GradleProject.class).get();
        // GradleScript buildScript = rootProject.getBuildScript();

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

            return Json.object().add("name", gradleProject.getName()).add("parent", parentProjectName)
                    .add("path", gradleProject.getPath()).add("tasks", jsonTasks);
        }).forEach(jsonProjects::add);

        String jsonString = jsonProjects.toString();
        System.out.println(jsonString);
        connection.close();
    }
}
