package com.github.badsyntax.gradletasks;

import org.junit.Test;
import static org.junit.Assert.*;

import java.io.IOException;

import com.github.badsyntax.gradletasks.CliApp;
import com.github.badsyntax.gradletasks.CliAppException;

public class CliAppTest {
    @Test
    public void testAppValidatesArguments() {
        final String exceptionMessage = "No source directory and/or target file specified";
        final String[] noArgs = {};
        try {
            CliApp.main(noArgs);
            fail("Should throw exception");
        } catch (CliAppException | IOException e) {
            assertEquals(exceptionMessage, e.getMessage());
        }

        final String[] oneArg = {"onearg"};
        try {
            CliApp.main(oneArg);
            fail("Should throw exception");
        } catch (CliAppException | IOException e) {
            assertEquals(exceptionMessage, e.getMessage());
        }
    }
}
