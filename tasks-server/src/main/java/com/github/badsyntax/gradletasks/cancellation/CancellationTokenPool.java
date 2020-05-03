package com.github.badsyntax.gradletasks.cancellation;

import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.gradle.tooling.CancellationTokenSource;

public class CancellationTokenPool {

  public enum TYPE {
    RUN,
    GET
  }

  private final ConcurrentMap<String, CancellationTokenSource> runTaskTokens =
      new ConcurrentHashMap<>();
  private final ConcurrentMap<String, CancellationTokenSource> getTasksTokens =
      new ConcurrentHashMap<>();
  private final EnumMap<TYPE, Map<String, CancellationTokenSource>> pool =
      new EnumMap<>(TYPE.class);

  public CancellationTokenPool() {
    pool.put(TYPE.RUN, runTaskTokens);
    pool.put(TYPE.GET, getTasksTokens);
  }

  public CancellationTokenSource get(TYPE type, String key) {
    return pool.get(type).get(key);
  }

  public void put(TYPE type, String key, CancellationTokenSource tokenSource) {
    pool.get(type).put(key, tokenSource);
  }

  public void remove(TYPE type, String key) {
    pool.get(type).remove(key);
  }

  public Map<String, CancellationTokenSource> getPoolType(TYPE type) {
    return pool.get(type);
  }

  public Map<TYPE, Map<String, CancellationTokenSource>> getPool() {
    return pool;
  }

  public void cancelAll() {
    pool.keySet().stream()
        .forEach(
            typeKey ->
                pool.get(typeKey).keySet().stream()
                    .forEach(poolKey -> pool.get(typeKey).get(poolKey).cancel()));
  }

  public void cancel(CancellationTokenPool.TYPE type) {
    Map<String, CancellationTokenSource> poolOfType = getPoolType(type);
    poolOfType.keySet().stream().forEach(key -> poolOfType.get(key).cancel());
  }
}
