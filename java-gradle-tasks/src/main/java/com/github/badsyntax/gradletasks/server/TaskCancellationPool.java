package com.github.badsyntax.gradletasks.server;

import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.inject.Inject;
import javax.inject.Singleton;
import org.gradle.tooling.CancellationTokenSource;

@Singleton
public class TaskCancellationPool {

    public enum TYPE {
        RUN, GET
    }

    private final EnumMap<TYPE, Map<String, CancellationTokenSource>> pool =
            new EnumMap<>(TYPE.class);


    @Inject
    public TaskCancellationPool() {
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

    public void cancelAll() {
        pool.keySet().stream().forEach(typeKey -> pool.get(typeKey).keySet().stream()
                .forEach(poolKey -> pool.get(typeKey).get(poolKey).cancel()));
    }
}
