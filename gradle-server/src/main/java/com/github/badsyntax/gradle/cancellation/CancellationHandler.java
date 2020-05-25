package com.github.badsyntax.gradle.cancellation;

import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import org.gradle.tooling.CancellationToken;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;

public class CancellationHandler {
  private static final CancellationTokenPool cancellationTokenPool = new CancellationTokenPool();

  private CancellationHandler() {}

  public static CancellationToken getCancellationToken(
      CancellationTokenPool.TYPE cancellationType, String cancellationKey) {
    CancellationTokenSource cancellationTokenSource = GradleConnector.newCancellationTokenSource();
    cancellationTokenPool.put(cancellationType, cancellationKey, cancellationTokenSource);
    return cancellationTokenSource.token();
  }

  public static CancellationToken getBuildCancellationToken(String cancellationKey) {
    return getCancellationToken(CancellationTokenPool.TYPE.GET, cancellationKey);
  }

  public static CancellationToken getRunTaskCancellationToken(String cancellationKey) {
    return getCancellationToken(CancellationTokenPool.TYPE.RUN, cancellationKey);
  }

  public static void clearToken(
      CancellationTokenPool.TYPE cancellationType, String cancellationKey) {
    cancellationTokenPool.remove(cancellationType, cancellationKey);
  }

  public static void clearBuildToken(String cancellationKey) {
    clearToken(CancellationTokenPool.TYPE.GET, cancellationKey);
  }

  public static void clearRunTaskToken(String cancellationKey) {
    clearToken(CancellationTokenPool.TYPE.RUN, cancellationKey);
  }

  public static void cancelRunTask(String cancellationKey) throws GradleCancellationException {
    CancellationTokenSource cancellationTokenSource =
        cancellationTokenPool.get(CancellationTokenPool.TYPE.RUN, cancellationKey);
    if (cancellationTokenSource == null) {
      throw new GradleCancellationException("Task is not running");
    } else {
      cancellationTokenSource.cancel();
    }
  }

  public static void cancelAllRunningBuilds() {
    cancellationTokenPool.cancel(CancellationTokenPool.TYPE.GET);
  }

  public static void cancelAllRunningTasks() {
    cancellationTokenPool.cancel(CancellationTokenPool.TYPE.RUN);
  }
}
