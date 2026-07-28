#!/usr/bin/env bash
#
# Warm up one or more Gradle wrappers by running `gradlew --version` with
# retries. The wrapper downloads its distribution on first use, and that
# download is a recurring flaky point on hosted runners, so pay the cost here
# with backoff instead of failing the real build task.
#
# Usage: warm-gradle-wrapper.sh <path/to/gradlew>...

set -euo pipefail

readonly MAX_ATTEMPTS=5

if [ "$#" -eq 0 ]; then
    echo "usage: $(basename "$0") <path/to/gradlew>..." >&2
    exit 1
fi

for gradlew in "$@"; do
    if [ ! -x "$gradlew" ]; then
        echo "$(basename "$0"): not an executable wrapper: $gradlew" >&2
        exit 1
    fi

    for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
        if "$gradlew" --version; then
            break
        fi
        if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
            echo "$(basename "$0"): $gradlew failed after $MAX_ATTEMPTS attempts" >&2
            exit 1
        fi
        sleep $((attempt * 15))
    done
done
