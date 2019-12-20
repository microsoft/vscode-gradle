package com.github.badsyntax.gradletasks.server;

import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.gradle.tooling.CancellationTokenSource;

public class GradleTaskPool {

    public enum TYPE {
        RUN, GET
    }

    private final EnumMap<TYPE, Map<String, CancellationTokenSource>> pool =
            new EnumMap<>(TYPE.class);

    public GradleTaskPool() {
        pool.put(TYPE.RUN, new ConcurrentHashMap<>());
        pool.put(TYPE.GET, new ConcurrentHashMap<>());
    }

    public CancellationTokenSource get(String key, TYPE type) {
        return pool.get(type).get(key);
    }

    public void put(String key, CancellationTokenSource tokenSource, TYPE type) {
        pool.get(type).put(key, tokenSource);
    }

    public void remove(String key, TYPE type) {
        pool.get(type).remove(key);
    }

    public Map<String, CancellationTokenSource> getPoolType(TYPE type) {
        return pool.get(type);
    }

    public Map<TYPE, Map<String, CancellationTokenSource>> getPool() {
        return pool;
    }
}
