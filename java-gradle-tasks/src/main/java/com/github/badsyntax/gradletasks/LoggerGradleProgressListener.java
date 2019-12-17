package com.github.badsyntax.gradletasks;

import java.util.logging.Logger;
import org.gradle.tooling.ProgressEvent;
import org.gradle.tooling.ProgressListener;

class GradleProgressListener implements ProgressListener {
    private Logger logger;

    public GradleProgressListener(Logger logger) {
        this.logger = logger;
    }

    @Override
    public void statusChanged(ProgressEvent progressEvent) {
        logger.info(progressEvent.getDescription());
    }
}
