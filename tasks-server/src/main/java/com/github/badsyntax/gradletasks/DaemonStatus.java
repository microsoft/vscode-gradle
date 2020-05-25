package com.github.badsyntax.gradletasks;

import com.github.badsyntax.gradletasks.exceptions.GradleWrapperException;
import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public class DaemonStatus {
  private GradleWrapper gradleWrapper;

  //  56783 IDLE     6.4
  //  39762 STOPPED  (other compatible daemons were started ...)
  private static Pattern statusRegex =
      Pattern.compile("^\\s+([0-9]+)\\s+([A-Z]+)\\s+([\\p{ASCII}]+)$");

  public DaemonStatus(GradleWrapper gradleWrapper) {
    this.gradleWrapper = gradleWrapper;
  }

  public synchronized ArrayList<DaemonInfo> get() throws GradleWrapperException {
    ArrayList<DaemonInfo> daemonStatus = new ArrayList<>();
    String processOutput = gradleWrapper.exec("--status", "--quiet");
    Stream.of(processOutput.split("\n"))
        .forEach(
            line -> {
              Matcher statusMatcher = statusRegex.matcher(line);
              if (statusMatcher.matches()) {
                String pid = statusMatcher.group(1);
                String status = statusMatcher.group(2);
                String info = statusMatcher.group(3);
                daemonStatus.add(
                    DaemonInfo.newBuilder()
                        .setPid(pid)
                        .setInfo(info)
                        .setStatus(DaemonInfo.DaemonStatus.valueOf(status))
                        .build());
              }
            });
    return daemonStatus;
  }
}
