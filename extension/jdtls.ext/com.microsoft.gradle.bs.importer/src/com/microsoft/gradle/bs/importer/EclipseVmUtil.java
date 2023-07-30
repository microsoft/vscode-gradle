package com.microsoft.gradle.bs.importer;

import java.io.File;
import java.util.Arrays;
import java.util.Optional;

import org.eclipse.jdt.internal.launching.StandardVMType;
import org.eclipse.jdt.launching.IVMInstall;
import org.eclipse.jdt.launching.IVMInstallType;
import org.eclipse.jdt.launching.JavaRuntime;
import org.eclipse.jdt.launching.VMStandin;
import org.eclipse.jdt.launching.environments.IExecutionEnvironment;

/**
 * Copied from org.eclipse.buildship.core/src/main/java/org/eclipse/buildship/core/internal/workspace/EclipseVmUtil.java
 */
public class EclipseVmUtil {

    private static final String VM_ID_PREFIX = "com.microsoft.gradle.bs.vm.";

    /**
     * Finds a Java VM in the Eclipse VM registry or registers a new one if none was available with
     * the selected version.
     *
     * @param version  the VM's supported Java version
     * @param location the location of the VM
     * @return the reference of an existing or newly created VM
     */
    public static IVMInstall findOrRegisterStandardVM(String version, File location) {
        return findOrRegisterVM(version, location);
    }

    private static IVMInstall findOrRegisterVM(String version, File location) {
        Optional<IVMInstall> vm = findRegisteredVM(version);
        return vm.isPresent() ? vm.get() : registerNewVM("Java SE " + version, location);
    }

    private static Optional<IVMInstall> findRegisteredVM(String version) {
        Optional<IExecutionEnvironment> possibleExecutionEnvironment = findExecutionEnvironment(version);
        if (!possibleExecutionEnvironment.isPresent()) {
            return Optional.empty();
        }

        IExecutionEnvironment executionEnvironment = possibleExecutionEnvironment.get();
        IVMInstall defaultVm = executionEnvironment.getDefaultVM();
        if (defaultVm != null) {
            return Optional.of(defaultVm);
        } else {
            IVMInstall[] compatibleVMs = executionEnvironment.getCompatibleVMs();
            IVMInstall firstVm = compatibleVMs.length > 0 ? compatibleVMs[0] : null;
            return Optional.ofNullable(firstVm);
        }
    }

    /**
     * Finds the execution environment for the given compliance version, e.g. 'JavaSE-1.6' for version '1.6'.
     *
     * @param version the Java version
     * @return the execution environment or {@link Optional#empty()} if none was found
     */
    public static Optional<IExecutionEnvironment> findExecutionEnvironment(String version) {
        String executionEnvironmentId = getExecutionEnvironmentId(version);
        for (IExecutionEnvironment executionEnvironment : JavaRuntime.getExecutionEnvironmentsManager().getExecutionEnvironments()) {
            if (executionEnvironment.getId().equals(executionEnvironmentId)) {
                return Optional.of(executionEnvironment);
            }
        }
        return Optional.empty();
    }

    private static String getExecutionEnvironmentId(String version) {
        // the result values correspond to the standard execution environment definitions in the
        // org.eclipse.jdt.launching/plugin.xml file
        if ("1.1".equals(version)) {
            return "JRE-1.1";
        } else if (Arrays.asList("1.5", "1.4", "1.3", "1.2").contains(version)) {
            return "J2SE-" + version;
        } else {
            return "JavaSE-" + version;
        }
    }

    private static IVMInstall registerNewVM(String name, File location) {
        // use the 'Standard VM' type to register a new VM
        IVMInstallType installType = JavaRuntime.getVMInstallType(StandardVMType.ID_STANDARD_VM_TYPE);

        // both the id and the name have to be unique for the registration
        String vmId = generateUniqueVMId(installType);

        // create the VM without firing events on individual method calls
        VMStandin vm = new VMStandin(installType, vmId);
        vm.setName(name);
        vm.setInstallLocation(location);
        return vm.convertToRealVM();
    }

    private static String generateUniqueVMId(IVMInstallType type) {
        // return a unique id for the VM
        int counter = 1;
        String vmId = VM_ID_PREFIX + counter;
        while (type.findVMInstall(vmId) != null) {
            counter++;
            vmId = VM_ID_PREFIX + counter;
        }
        return vmId;
    }

    private EclipseVmUtil() {
    }
}
