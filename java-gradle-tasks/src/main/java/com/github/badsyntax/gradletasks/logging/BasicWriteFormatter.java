package com.github.badsyntax.gradletasks.logging;

import java.util.logging.Formatter;
import java.util.logging.LogRecord;

public class BasicWriteFormatter extends Formatter {
    @Override
    public String format(LogRecord record) {
        return String.format("%s%s", record.getMessage(), System.lineSeparator());
    }
}
