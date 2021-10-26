// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.utils;

import java.io.File;

public class Utils {
  public static boolean isValidFile(File file) {
    return file != null && file.exists();
  }
}
