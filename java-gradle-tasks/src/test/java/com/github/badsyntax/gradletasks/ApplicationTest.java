package com.github.badsyntax.gradletasks;

// import org.junit.Test;
import static org.junit.Assert.*;

import java.io.IOException;

public class ApplicationTest {
    // @Test
    public void testAppValidatesArguments() {
        final String exceptionMessage = "No source directory and/or target file specified";
        final String[] noArgs = {};
        try {
            Application.main(noArgs);
            fail("Should throw exception");
        } catch (ApplicationException | IOException e) {
            assertEquals(exceptionMessage, e.getMessage());
        }

        final String[] oneArg = {"onearg"};
        try {
            Application.main(oneArg);
            fail("Should throw exception");
        } catch (ApplicationException | IOException e) {
            assertEquals(exceptionMessage, e.getMessage());
        }
    }
}
