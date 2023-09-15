package com.microsoft.gradle.bs.importer.jpms;

import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import org.apache.commons.lang3.StringUtils;

/**
 * The collection of the JPMS arguments that JDT supports.
 */
public class JpmsArguments {

    // module name -> set of argument values
    private Map<String, Set<String>> addExports;
    private Map<String, Set<String>> addOpens;
    private Map<String, Set<String>> addReads;
    private Map<String, Set<String>> patchModule;

    public JpmsArguments() {
        addExports = new HashMap<>();
        addOpens = new HashMap<>();
        addReads = new HashMap<>();
        patchModule = new HashMap<>();
    }

    public void addJpmsArgument(JpmsArgType type, JpmsArgValue value) {
        switch (type) {
            case ADD_EXPORTS:
                append(addExports, value.getModule(), value.getValue());
                break;
            case ADD_OPENS:
                append(addOpens, value.getModule(), value.getValue());
                break;
            case ADD_READS:
                append(addReads, value.getModule(), value.getValue());
                break;
            case PATCH_MODULE:
                append(patchModule, value.getModule(), value.getValue());
                break;
            default:
                break;
        }
    }

    public Map<String, Set<String>> getGroupedArgumentsByType(JpmsArgType type) {
        switch (type) {
            case ADD_EXPORTS:
                return addExports;
            case ADD_OPENS:
                return addOpens;
            case ADD_READS:
                return addReads;
            case PATCH_MODULE:
                return patchModule;
            default:
                return Collections.emptyMap();
        }
    }

    public boolean isEmpty() {
        return addExports.isEmpty() && addOpens.isEmpty()
                && addReads.isEmpty() && patchModule.isEmpty();
    }

    private void append(Map<String, Set<String>> map, String module, String value) {
        if (StringUtils.isNotBlank(module) && StringUtils.isNotBlank(value)) {
            map.computeIfAbsent(module.trim(), k -> new LinkedHashSet<>()).add(value.trim());
        }
    }
}
