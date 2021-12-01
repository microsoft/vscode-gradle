package com.github.badsyntax.gradle.process;

import java.io.BufferedReader;
import java.io.IOException;

public class ProcessOutput implements AutoCloseable {
	private BufferedReader stdOut;
	private BufferedReader stdErr;

	public ProcessOutput(BufferedReader stdOut, BufferedReader stdErr) {
		this.stdOut = stdOut;
		this.stdErr = stdErr;
	}

	public synchronized BufferedReader getStdOut() {
		return this.stdOut;
	}

	public synchronized BufferedReader getStdErr() {
		return this.stdErr;
	}

	@Override
	public synchronized void close() throws IOException {
		this.stdOut.close();
		this.stdErr.close();
	}
}
