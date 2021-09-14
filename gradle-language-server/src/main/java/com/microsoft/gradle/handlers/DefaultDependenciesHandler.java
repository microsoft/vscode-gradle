/*******************************************************************************
 * Copyright (c) 2021 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 2.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *     Microsoft Corporation - initial API and implementation
*******************************************************************************/
package com.microsoft.gradle.handlers;

import java.util.ArrayList;
import java.util.List;

import org.eclipse.lsp4j.DocumentSymbol;
import org.eclipse.lsp4j.Range;

public class DefaultDependenciesHandler {
  public class DefaultDependencyItem {
    private String name;
    private String configuration;
    private Range range;

    public DefaultDependencyItem(String name, String configuration, Range range) {
      this.name = name;
      this.configuration = configuration;
      this.range = range;
    }
  }

  public List<DefaultDependencyItem> getDefaultDependencies(List<DocumentSymbol> symbols) {
    List<DefaultDependencyItem> dependencies  = new ArrayList<>();
    for (DocumentSymbol symbol : symbols) {
      String configuration = symbol.getName();
      String id = symbol.getDetail();
      Range range = symbol.getRange();
      DefaultDependencyItem item = new DefaultDependencyItem(id, configuration, range);
      dependencies.add(item);
    }
    return dependencies;
  }
}
