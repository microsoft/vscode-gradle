package com.microsoft.gradle.bs.importer.jpms;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.ListIterator;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.runtime.IPath;
import org.eclipse.jdt.core.IClasspathAttribute;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IModuleDescription;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.internal.core.JarPackageFragmentRoot;
import org.eclipse.jdt.internal.core.JrtPackageFragmentRoot;
import org.eclipse.jdt.launching.JavaRuntime;

public class JpmsUtils {

    /**
     * The delimiter that JDT used to separate multiple options
     * into a single classpath attribute.
     */
    private static final String ATTRIBUTE_DELIMITER = ":";
    /**
     * The separator of the JPMS argument. For example, '--add-exports=module/package=other.module'.
     */
    private static final String ARGUMENT_SEPARATOR = "=";

    /**
     * Categorize the raw list of compiler arguments.
     * @param compilerArgs List of compiler arguments.
     */
    public static JpmsArguments categorizeJpmsArguments(List<String> compilerArgs) {
        JpmsArguments jpmsArgs = new JpmsArguments();
        if (compilerArgs.isEmpty()) {
            return jpmsArgs;
        }
        ListIterator<String> iterator = compilerArgs.listIterator();
        while (iterator.hasNext()) {
            String arg = iterator.next();
            if (StringUtils.isBlank(arg)) {
                continue;
            }
            arg = arg.trim();
            String value = null;
            if (arg.indexOf(ARGUMENT_SEPARATOR) > -1) {
                value = arg.substring(arg.indexOf(ARGUMENT_SEPARATOR) + 1);
                arg = arg.substring(0, arg.indexOf(ARGUMENT_SEPARATOR));
            }
            JpmsArgType type = JpmsArgType.fromJavacArgumentName(arg);
            if (type == null) {
                continue;
            }

            if (value == null && iterator.hasNext()) {
                value = iterator.next();
            }
            JpmsArgValue jpmsValue = type.parse(value);
            if (jpmsValue != null) {
                jpmsArgs.addJpmsArgument(type, jpmsValue);
            }
        }
        return jpmsArgs;
    }

    /**
     * Append JPMS attributes to the classpath entries.
     * @param javaProject The Java project.
     * @param classpathMap The classpath entries.
     * @param jpmsArgs The JPMS arguments.
     */
    public static void appendJpmsAttributesToEntries(IJavaProject javaProject, Map<IPath, IClasspathEntry> classpathMap,
            JpmsArguments jpmsArgs) {
        for (Entry<IPath, IClasspathEntry> mapEntry : classpathMap.entrySet()) {
            IClasspathEntry classpathEntry = mapEntry.getValue();
            if (classpathEntry.getEntryKind() == IClasspathEntry.CPE_LIBRARY) {
                classpathEntry = updateJpmsAttributesForClasspathEntry(javaProject,
                        classpathEntry, jpmsArgs, false /*isJre*/);
                mapEntry.setValue(classpathEntry);
            } else if (classpathEntry.getEntryKind() == IClasspathEntry.CPE_CONTAINER
                    && mapEntry.getKey().toString().startsWith(JavaRuntime.JRE_CONTAINER)) {
                classpathEntry = updateJpmsAttributesForClasspathEntry(javaProject,
                        classpathEntry, jpmsArgs, true /*isJre*/);
                mapEntry.setValue(classpathEntry);
            }
        }
    }

    /**
     * Add JPMS attributes to the classpath entry.
     * @param javaProject The Java project.
     * @param entry The classpath entry.
     * @param jpmsArgs The JPMS arguments.
     * @param isJre Whether the classpath entry is a JRE container.
     * @return A new classpath entry with JPMS attributes appended.
     */
    public static IClasspathEntry updateJpmsAttributesForClasspathEntry(IJavaProject javaProject, IClasspathEntry entry,
            JpmsArguments jpmsArgs, boolean isJre) {
        List<IClasspathAttribute> jpmsAttributes = new LinkedList<>();
        Set<String> availableModules = getJpmsModules(javaProject, entry, isJre);
        for (JpmsArgType type : JpmsArgType.values()) {
            String aggregatedValue = getAggregatedValue(availableModules, jpmsArgs, type);
            if (StringUtils.isNotBlank(aggregatedValue)) {
                jpmsAttributes.add(JavaCore.newClasspathAttribute(type.getEclipseArgumentName(), aggregatedValue));
            }
        }

        if (jpmsAttributes.isEmpty()) {
            return entry;
        }

        jpmsAttributes.addAll(0, Arrays.asList(entry.getExtraAttributes()));
        if (isJre) {
            return JavaCore.newContainerEntry(
                    entry.getPath(),
                    entry.getAccessRules(),
                    jpmsAttributes.toArray(new IClasspathAttribute[0]),
                    entry.isExported()
            );
        }
        return JavaCore.newLibraryEntry(
                entry.getPath(),
                entry.getSourceAttachmentPath(),
                entry.getSourceAttachmentRootPath(),
                entry.getAccessRules(),
                jpmsAttributes.toArray(new IClasspathAttribute[0]),
                entry.isExported()
        );
    }

    private static Set<String> getJpmsModules(IJavaProject javaProject, IClasspathEntry entry, boolean isJre) {
        Set<String> result = new HashSet<>();
        IPackageFragmentRoot[] fragmentRoots = javaProject.findUnfilteredPackageFragmentRoots(entry);
        for (IPackageFragmentRoot root : fragmentRoots) {
            if ((isJre && root instanceof JrtPackageFragmentRoot)
                    || (!isJre && root instanceof JarPackageFragmentRoot)) {
                IModuleDescription module = root.getModuleDescription();
                if (module != null) {
                    result.add(module.getElementName());
                }
            }
        }
        return result;
    }

    private static String getAggregatedValue(Set<String> availableModules, JpmsArguments jpmsArgs, JpmsArgType type) {
        StringBuilder sb = new StringBuilder();
        for (Iterator<Entry<String, Set<String>>> it = jpmsArgs.getGroupedArgumentsByType(JpmsArgType.ADD_EXPORTS).entrySet().iterator(); it.hasNext();) {
            Entry<String, Set<String>> valueEntry = it.next();
            String moduleName = valueEntry.getKey();
            Set<String> values = valueEntry.getValue();
            if (availableModules.contains(moduleName)) {
                sb.append(values.stream().collect(Collectors.joining(ATTRIBUTE_DELIMITER)));
                it.remove();
            }
        }
        return sb.toString();
    }

    private JpmsUtils() {}
}
