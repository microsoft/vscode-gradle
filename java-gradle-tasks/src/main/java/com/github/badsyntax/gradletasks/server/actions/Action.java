package com.github.badsyntax.gradletasks.server.actions;

import com.github.badsyntax.gradletasks.server.GradleTasksServerException;
import org.gradle.tooling.CancellationToken;

interface Action {
    public void run() throws GradleTasksServerException;
}
