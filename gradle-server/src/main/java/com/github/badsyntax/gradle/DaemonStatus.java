package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.exceptions.GradleExecutionException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public class DaemonStatus {
	private GradleExecution gradleExecution;

	// 56783 IDLE 6.4
	// 39762 STOPPED (other compatible daemons were started ...)
	private static final Pattern STATUS_REGEX = Pattern.compile("^\\s+([0-9]+)\\s+([A-Z]+)\\s+([\\p{ASCII}]+)$");

	public DaemonStatus(GradleExecution gradleExecution) {
		this.gradleExecution = gradleExecution;
	}

	public synchronized List<DaemonInfo> get() throws GradleExecutionException {
		ArrayList<DaemonInfo> daemonStatus = new ArrayList<>();
		String processOutput = gradleExecution.exec("--status", "--quiet");
		Stream.of(processOutput.split("\n")).forEach(line -> {
			Matcher statusMatcher = STATUS_REGEX.matcher(line);
			if (statusMatcher.matches()) {
				String pid = statusMatcher.group(1);
				String status = statusMatcher.group(2);
				String info = statusMatcher.group(3);
				daemonStatus.add(DaemonInfo.newBuilder().setPid(pid).setInfo(info)
						.setStatus(DaemonInfo.DaemonStatus.valueOf(status)).build());
			}
		});
		return daemonStatus;
	}
}
