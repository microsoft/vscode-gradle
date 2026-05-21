package com.github.badsyntax.gradle.handlers;

import com.github.badsyntax.gradle.DependencyItem;
import com.microsoft.gradle.api.GradleDependencyNode;
import java.util.ArrayList;
import java.util.List;

public final class DependencyItemUtils {
	private DependencyItemUtils() {
	}

	public static DependencyItem getDependencyItem(GradleDependencyNode node) {
		DependencyItem.Builder item = DependencyItem.newBuilder();
		item.setName(node.getName());
		item.setTypeValue(node.getType().ordinal());
		if (node.getChildren() == null) {
			return item.build();
		}
		List<DependencyItem> children = new ArrayList<>();
		for (GradleDependencyNode child : node.getChildren()) {
			children.add(getDependencyItem(child));
		}
		item.addAllChildren(children);
		return item.build();
	}
}
