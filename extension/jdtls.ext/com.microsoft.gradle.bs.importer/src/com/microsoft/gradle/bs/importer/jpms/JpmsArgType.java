package com.microsoft.gradle.bs.importer.jpms;

import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.jdt.core.IClasspathAttribute;

/**
 * The type of JPMS argument that JDT supports.
 */
public enum JpmsArgType {
    ADD_EXPORTS("--add-exports", IClasspathAttribute.ADD_EXPORTS,
            Pattern.compile("^(([A-Za-z0-9\\.$_]*)/[A-Za-z0-9\\.$_]*=[A-Za-z0-9\\.$_-]*)$")),

    ADD_OPENS("--add-opens", IClasspathAttribute.ADD_OPENS,
            Pattern.compile("^(([A-Za-z0-9\\.$_]*)/[A-Za-z0-9\\.$_]*=[A-Za-z0-9\\.$_-]*)$")),

    ADD_READS("--add-reads", IClasspathAttribute.ADD_READS,
            Pattern.compile("^(([A-Za-z0-9\\.$_]*)=[A-Za-z0-9\\.$_-]*)$")),

    PATCH_MODULE("--patch-module", IClasspathAttribute.PATCH_MODULE,
            Pattern.compile("^(([A-Za-z0-9\\.$_]*)=.*)$"));

    private String javacArgumentName;

    private String eclipseArgumentName;

    private Pattern extractPattern;

    JpmsArgType(String javacArgumentName, String eclipseArgumentName,
            Pattern extractPattern) {
        this.javacArgumentName = javacArgumentName;
        this.eclipseArgumentName = eclipseArgumentName;
        this.extractPattern = extractPattern;
    }

    /**
     * Get the JPMS argument type from the javac argument.
     */
    public static JpmsArgType fromJavacArgumentName(String arg) {
        return Arrays.stream(JpmsArgType.values())
                .filter(type -> type.javacArgumentName.equals(arg))
                .findFirst()
                .orElse(null);
    }

    public String getEclipseArgumentName() {
        return eclipseArgumentName;
    }

    /**
     * Parse the JPMS argument value from the javac argument value.
     */
    public JpmsArgValue parse(String value) {
        if (StringUtils.isBlank(value)) {
            return null;
        }

        String trimmed = value.trim();
        Matcher matcher = extractPattern.matcher(trimmed);

        if (matcher.matches()) {
            String argValue = matcher.group(1);
            String module = matcher.group(2);
            return new JpmsArgValue(module, argValue);
        }

        return null;
    }
}
