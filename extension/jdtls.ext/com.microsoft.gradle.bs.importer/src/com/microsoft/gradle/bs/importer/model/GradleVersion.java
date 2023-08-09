/*******************************************************************************
 * Copyright (c) 2023 Gradle Inc. and others
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copied from org/eclipse/buildship/core/internal/util/gradle/GradleVersion.java
 ******************************************************************************/

package com.microsoft.gradle.bs.importer.model;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Represents a released version of Gradle
 * <p>
 * The implementation is a slimmed down version of the {@code org.gradle.util.GradleVersion}
 * internal class from Gradle 4.6. The source URL:
 * <a href="https://github.com/gradle/gradle/blob/v4.6.0/subprojects/base-services/src/main/java/org/gradle/util/GradleVersion.java" >
 * https://github.com/gradle/gradle/blob/v4.6.0/subprojects/base-services/src/main/java/org/gradle/util/GradleVersion.java
 * </a>
 *
 * @author Donat Csikos
 */
public final class GradleVersion implements Comparable<GradleVersion> {

    private static final Pattern VERSION_PATTERN = Pattern.compile("((\\d+)(\\.\\d+)+)(-(\\p{Alpha}+)-(\\d+[a-z]?))?(-(SNAPSHOT|\\d{14}([-+]\\d{4})?))?");
    private static final int STAGE_MILESTONE = 0;

    private final String version;
    private final Long snapshot;
    private final String versionPart;
    private final Stage stage;

    /**
     * Parses the given string into a GradleVersion.
     *
     * @throws IllegalArgumentException On unrecognized version string.
     */
    public static GradleVersion version(String version) throws IllegalArgumentException {
        return new GradleVersion(version);
    }

    private GradleVersion(String version) {
        this.version = version;
        Matcher matcher = VERSION_PATTERN.matcher(version);
        if (!matcher.matches()) {
            throw new IllegalArgumentException(String.format("'%s' is not a valid Gradle version string (examples: '1.0', '1.0-rc-1')", version));
        }

        this.versionPart = matcher.group(1);

        if (matcher.group(4) != null) {
            int stageNumber;
            if (matcher.group(5).equals("milestone")) {
                stageNumber = STAGE_MILESTONE;
            } else if (matcher.group(5).equals("preview")) {
                stageNumber = 2;
            } else if (matcher.group(5).equals("rc")) {
                stageNumber = 3;
            } else {
                stageNumber = 1;
            }
            String stageString = matcher.group(6);
            this.stage = new Stage(stageNumber, stageString);
        } else {
            this.stage = null;
        }

        if ("snapshot".equals(matcher.group(5))) {
            this.snapshot = 0L;
        } else if (matcher.group(8) == null) {
            this.snapshot = null;
        } else if ("SNAPSHOT".equals(matcher.group(8))) {
            this.snapshot = 0L;
        } else {
            try {
                if (matcher.group(9) != null) {
                    this.snapshot = new SimpleDateFormat("yyyyMMddHHmmssZ").parse(matcher.group(8)).getTime();
                } else {
                    SimpleDateFormat format = new SimpleDateFormat("yyyyMMddHHmmss");
                    format.setTimeZone(TimeZone.getTimeZone("UTC"));
                    this.snapshot = format.parse(matcher.group(8)).getTime();
                }
            } catch (ParseException e) {
                throw new IllegalArgumentException(e);
            }
        }
    }

    @Override
    public String toString() {
        return "Gradle " + this.version;
    }

    public String getVersion() {
        return this.version;
    }

    public boolean isSnapshot() {
        return this.snapshot != null;
    }

    /**
     * The base version of this version. For pre-release versions, this is the target version.
     *
     * For example, the version base of '1.2-rc-1' is '1.2'.
     *
     * @return The version base
     */
    public GradleVersion getBaseVersion() {
        if (this.stage == null && this.snapshot == null) {
            return this;
        }
        return version(this.versionPart);
    }

    @Override
    public int compareTo(GradleVersion gradleVersion) {
        String[] majorVersionParts = this.versionPart.split("\\.");
        String[] otherMajorVersionParts = gradleVersion.versionPart.split("\\.");

        for (int i = 0; i < majorVersionParts.length && i < otherMajorVersionParts.length; i++) {
            int part = Integer.parseInt(majorVersionParts[i]);
            int otherPart = Integer.parseInt(otherMajorVersionParts[i]);

            if (part > otherPart) {
                return 1;
            }
            if (otherPart > part) {
                return -1;
            }
        }
        if (majorVersionParts.length > otherMajorVersionParts.length) {
            return 1;
        }
        if (majorVersionParts.length < otherMajorVersionParts.length) {
            return -1;
        }

        if (this.stage != null && gradleVersion.stage != null) {
            int diff = this.stage.compareTo(gradleVersion.stage);
            if (diff != 0) {
                return diff;
            }
        }
        if (this.stage == null && gradleVersion.stage != null) {
            return 1;
        }
        if (this.stage != null && gradleVersion.stage == null) {
            return -1;
        }

        if (this.snapshot != null && gradleVersion.snapshot != null) {
            return this.snapshot.compareTo(gradleVersion.snapshot);
        }
        if (this.snapshot == null && gradleVersion.snapshot != null) {
            return 1;
        }
        if (this.snapshot != null && gradleVersion.snapshot == null) {
            return -1;
        }

        return 0;
    }

    @Override
    public boolean equals(Object o) {
        if (o == this) {
            return true;
        }
        if (o == null || o.getClass() != getClass()) {
            return false;
        }
        GradleVersion other = (GradleVersion) o;
        return this.version.equals(other.version);
    }

    @Override
    public int hashCode() {
        return this.version.hashCode();
    }

    public boolean isValid() {
        return this.versionPart != null;
    }

    /**
     * Utility class to compare snapshot/milesone/rc releases.
     */
    static final class Stage implements Comparable<Stage> {

        final int stage;
        final int number;
        final Character patchNo;

        Stage(int stage, String number) {
            this.stage = stage;
            Matcher m = Pattern.compile("(\\d+)([a-z])?").matcher(number);
            try {
                m.matches();
                this.number = Integer.parseInt(m.group(1));
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid stage small number: " + number, e);
            }

            if (m.groupCount() == 2 && m.group(2) != null) {
                this.patchNo = m.group(2).charAt(0);
            } else {
                this.patchNo = '_';
            }
        }

        @Override
        public int compareTo(Stage other) {
            if (this.stage > other.stage) {
                return 1;
            }
            if (this.stage < other.stage) {
                return -1;
            }
            if (this.number > other.number) {
                return 1;
            }
            if (this.number < other.number) {
                return -1;
            }
            if (this.patchNo > other.patchNo) {
                return 1;
            }
            if (this.patchNo < other.patchNo) {
                return -1;
            }
            return 0;
        }
    }
}
