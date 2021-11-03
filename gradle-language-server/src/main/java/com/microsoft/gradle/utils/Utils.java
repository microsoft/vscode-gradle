// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.gradle.utils;

import java.io.File;
import java.nio.file.Path;

public class Utils {

  public static String getFileNameWithoutExtension(Path fileName) {
    String nameWithExtension = fileName.toString();
    int index = nameWithExtension.lastIndexOf('.');
    if (index > 0 && index < nameWithExtension.length() - 1) {
      return nameWithExtension.substring(0, index);
    }
    return null;
  }

  public static boolean isValidFile(File file) {
    return file != null && file.exists();
  }

  public static boolean isValidFolder(File folder) {
    return folder != null && folder.exists() && folder.isDirectory();
  }

  public static File findSubFolder(File rootFolder, String name) {
    if (!isValidFolder(rootFolder)) {
      return null;
    }
    for (File file : rootFolder.listFiles()) {
      if (file.isDirectory() && file.getName().equals(name)) {
        return file;
      }
    }
    return null;
  }
}
