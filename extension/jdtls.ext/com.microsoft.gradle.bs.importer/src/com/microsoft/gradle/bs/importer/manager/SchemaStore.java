/*******************************************************************************
 * Copyright (c) 2023 Microsoft Corporation and others
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 2.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *     Microsoft Corporation - - initial API and implementation
 ******************************************************************************/

package com.microsoft.gradle.bs.importer.manager;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import org.eclipse.core.runtime.CoreException;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;

/**
 * Store the schema version of the BSP project.
 */
public class SchemaStore {
    private Map<String, String> schemas;
    private File stateFile;

    private static final String SERIALIZATION_FILE_NAME = ".schema";

    public SchemaStore(File stateLocation) {
        this.stateFile = new File(stateLocation, SERIALIZATION_FILE_NAME);
        if (stateFile.isFile()) {
            schemas = deserializeSchemaFile();
        } else {
            schemas = new HashMap<>();
        }
    }

    /**
     * Update the schema version of the BSP project. Return true if the schema version is changed.
     * @throws CoreException
     */
    public boolean updateSchemaInformation(Path p, String version) throws CoreException {
        try {
            synchronized (schemas) {
                String key = p.toString();
                if (!version.equals(schemas.get(key))) {
                    schemas.put(key, version);
                    serializeSchemaFile();
                    return true;
                }
            }
        } catch (IOException e) {
            JavaLanguageServerPlugin.logException("Exception occurred while serialization of schema file.", e);
        }

        return false;

    }

    private void serializeSchemaFile() throws IOException {
        try (ObjectOutputStream outStream = new ObjectOutputStream(new FileOutputStream(stateFile))) {
            outStream.writeObject(schemas);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> deserializeSchemaFile() {
        try (ObjectInputStream ois = new ObjectInputStream(new FileInputStream(stateFile))) {
            return (Map<String, String>) ois.readObject();
        } catch (IOException | ClassNotFoundException e) {
            JavaLanguageServerPlugin.logException("Exception occurred while deserialization of schema file.", e);
            return new HashMap<>();
        }
    }
}
