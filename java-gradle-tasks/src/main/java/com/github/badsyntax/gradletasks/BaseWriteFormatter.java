package com.github.badsyntax.gradletasks;

import java.util.logging.Formatter;
import java.util.logging.LogRecord;

class BasicWriteFormatter extends Formatter {
    @Override
    public String format(LogRecord record) {
        return record.getMessage();
    }
}
