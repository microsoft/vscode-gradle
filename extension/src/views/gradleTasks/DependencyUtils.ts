// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { DependencyItem, GradleDependencyType } from '../../proto/gradle_pb';
import { DependencyConfigurationTreeItem } from './DependencyConfigurationTreeItem';
import { DependencyTreeItem } from './DependencyTreeItem';
import { ProjectDependencyTreeItem } from './ProjectDependencyTreeItem';
export const GRADLE_OMITTED_REVEAL = 'gradle.omitted.reveal';

export function protocolItem2ProjectDependencyTreeItem(
  protocolItem: DependencyItem,
  parent: vscode.TreeItem
): ProjectDependencyTreeItem | undefined {
  const name = 'Dependencies';
  const projectItem: ProjectDependencyTreeItem = new ProjectDependencyTreeItem(
    name,
    vscode.TreeItemCollapsibleState.Collapsed,
    parent
  );
  const children = protocolItem.getChildrenList();
  const treeChildren = [];
  for (const child of children) {
    if (child.getType() !== GradleDependencyType.CONFIGURATION) {
      continue;
    }
    const configurationItem = protocolItem2DependencyConfigurationTreeItem(
      child,
      projectItem
    );
    if (configurationItem) {
      treeChildren.push(configurationItem);
    }
  }
  if (!treeChildren.length) {
    return undefined;
  }
  projectItem.setChildren(treeChildren);
  return projectItem;
}

export function protocolItem2DependencyConfigurationTreeItem(
  protocolItem: DependencyItem,
  parent: vscode.TreeItem
): DependencyConfigurationTreeItem | undefined {
  const name = protocolItem.getName();
  const storageMap = new Map();
  const configurationItem: DependencyConfigurationTreeItem = new DependencyConfigurationTreeItem(
    name,
    vscode.TreeItemCollapsibleState.Collapsed,
    parent
  );
  const children = protocolItem.getChildrenList();
  const treeChildren = [];
  for (const child of children) {
    if (child.getType() !== GradleDependencyType.DEPENDENCY) {
      continue;
    }
    treeChildren.push(
      protocolItem2DependencyTreeItem(child, configurationItem, storageMap)
    );
  }
  if (!treeChildren.length) {
    return undefined;
  }
  configurationItem.setChildren(treeChildren);
  return configurationItem;
}

export function protocolItem2DependencyTreeItem(
  protocolItem: DependencyItem,
  parent: vscode.TreeItem,
  storageMap: Map<string, vscode.TreeItem>
): DependencyTreeItem {
  const name = protocolItem.getName();
  const dependencyItem: DependencyTreeItem = new DependencyTreeItem(
    name,
    vscode.TreeItemCollapsibleState.Collapsed,
    parent
  );
  if (storageMap.has(name)) {
    const omittedTreeItem = storageMap.get(name);
    if (omittedTreeItem) {
      dependencyItem.setOmittedTreeItem(omittedTreeItem);
    }
    dependencyItem.contextValue = 'omitted';
    dependencyItem.label = dependencyItem.label + ' (*)';
    dependencyItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
  } else {
    storageMap.set(name, dependencyItem);
    const children = protocolItem.getChildrenList();
    const treeChildren = [];
    for (const child of children) {
      if (child.getType() !== GradleDependencyType.DEPENDENCY) {
        continue;
      }
      treeChildren.push(
        protocolItem2DependencyTreeItem(child, dependencyItem, storageMap)
      );
    }
    dependencyItem.collapsibleState =
      treeChildren.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    dependencyItem.setChildren(treeChildren);
  }
  return dependencyItem;
}
