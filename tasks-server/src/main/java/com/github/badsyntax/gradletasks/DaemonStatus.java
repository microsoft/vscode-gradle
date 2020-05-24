package com.github.badsyntax.gradletasks;

import com.github.badsyntax.gradletasks.exceptions.GradleWrapperException;
import java.io.BufferedReader;
import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class DaemonStatus {
  private GradleWrapperExecutor gradleWrapper;

  //  56783 IDLE     6.4
  //  39762 STOPPED  (other compatible daemons were started ...)
  private static Pattern STATUS_REGEX =
      Pattern.compile("^\\s+([0-9]+)\\s+([A-Z]+)\\s+([\\p{ASCII}]+)$");

  public DaemonStatus(GradleWrapperExecutor gradleWrapper) {
    this.gradleWrapper = gradleWrapper;
  }

  public ArrayList<DaemonInfo> get() throws GradleWrapperException {
    ArrayList<DaemonInfo> daemonStatus = new ArrayList<>();
    BufferedReader statusOutput = gradleWrapper.exec("--status", "--quiet");
    statusOutput
        .lines()
        .forEach(
            line -> {
              Matcher statusMatcher = STATUS_REGEX.matcher(line);
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
