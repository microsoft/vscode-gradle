package com.github.badsyntax.gradletasks.server.actions;

import com.github.badsyntax.gradletasks.server.GradleTasksServerException;

interface Action {
    public void run() throws GradleTasksServerException;
}
