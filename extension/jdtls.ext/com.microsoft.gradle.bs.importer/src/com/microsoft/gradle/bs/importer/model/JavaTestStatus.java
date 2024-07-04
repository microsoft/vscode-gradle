package com.microsoft.gradle.bs.importer.model;

public enum JavaTestStatus {
    /**
     * Test will be run, but is not currently running.
     */
    Queued(1),

    /**
     * Test is currently running.
     */
    Running(2),

    /**
     * Test run has passed.
     */
    Passed(3),

    /**
     * Test run has failed (on an assertion).
     */
    Failed(4),

    /**
     * Test run has been skipped.
     */
    Skipped(5),

    /**
     * Test run failed for some other reason (compilation error, timeout, etc).
     */
    Errored(6);

    private final int value;

    JavaTestStatus(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }
}
