package com.github.badsyntax.gradle;

import com.github.badsyntax.gradle.exceptions.GradleCancellationException;
import com.google.common.base.Strings;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.gradle.tooling.CancellationToken;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;

public class GradleBuildCancellation {
	private static final ConcurrentMap<String, CancellationTokenSource> tokens = new ConcurrentHashMap<>();

	private GradleBuildCancellation() {
	}

	public static CancellationToken buildToken(String cancellationKey) {
		CancellationTokenSource cancellationTokenSource = GradleConnector.newCancellationTokenSource();
		tokens.put(cancellationKey, cancellationTokenSource);
		return cancellationTokenSource.token();
	}

	public static void clearToken(String cancellationKey) {
		tokens.remove(cancellationKey);
	}

	public static void cancelBuild(String cancellationKey) throws GradleCancellationException {
		if (Strings.isNullOrEmpty(cancellationKey)) {
			throw new GradleCancellationException("No cancellation key specified");
		}
		CancellationTokenSource cancellationTokenSource = tokens.get(cancellationKey);
		if (cancellationTokenSource == null) {
			throw new GradleCancellationException("Build is not running for key: " + cancellationKey);
		} else {
			cancellationTokenSource.cancel();
		}
	}

	public static void cancelBuilds() throws GradleCancellationException {
		for (String cancellationKey : tokens.keySet()) {
			cancelBuild(cancellationKey);
		}
	}
}
