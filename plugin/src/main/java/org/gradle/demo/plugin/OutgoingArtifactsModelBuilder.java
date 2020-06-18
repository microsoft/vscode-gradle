/*
 * Copyright 2003-2012 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.gradle.demo.plugin;

import org.gradle.api.Project;
import org.gradle.api.artifacts.Configuration;
import org.gradle.demo.model.DefaultOutgoingArtifactsModel;
import org.gradle.demo.model.OutgoingArtifactsModel;
import org.gradle.tooling.provider.model.ToolingModelBuilder;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;

public class OutgoingArtifactsModelBuilder implements ToolingModelBuilder {

    private static final String MODEL_NAME = OutgoingArtifactsModel.class.getName();

    @Override
    public boolean canBuild(String modelName) {
        return modelName.equals(MODEL_NAME);
    }

    @Override
    public Object buildAll(String modelName, Project project) {
        Set<File> artifacts = new LinkedHashSet<>();
        project.allprojects(p -> {
            for (Configuration configuration : p.getConfigurations()) {
                if (configuration.isCanBeConsumed()) {
                    artifacts.addAll(configuration.getArtifacts().getFiles().getFiles());
                }
            }
        });
        return new DefaultOutgoingArtifactsModel(new ArrayList<>(artifacts));
    }
}
