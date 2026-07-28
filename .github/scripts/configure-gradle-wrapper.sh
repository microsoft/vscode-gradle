#!/usr/bin/env bash
#
# Repoint one or more gradle-wrapper.properties files at
# downloads.gradle.org and raise the wrapper download timeout.
# services.gradle.org is frequently rate-limited from hosted runners, which
# makes the wrapper download flaky.
#
# Usage: configure-gradle-wrapper.sh <gradle-wrapper.properties>...

set -euo pipefail

if [ "$#" -eq 0 ]; then
    echo "usage: $(basename "$0") <gradle-wrapper.properties>..." >&2
    exit 1
fi

for properties in "$@"; do
    if [ ! -f "$properties" ]; then
        echo "$(basename "$0"): no such file: $properties" >&2
        exit 1
    fi

    sed -i 's#https\\://services.gradle.org/distributions/#https\\://downloads.gradle.org/distributions/#' "$properties"
    sed -i 's#https://services.gradle.org/distributions/#https://downloads.gradle.org/distributions/#' "$properties"

    if grep -q '^networkTimeout=' "$properties"; then
        sed -i 's/^networkTimeout=.*/networkTimeout=60000/' "$properties"
    else
        printf '\nnetworkTimeout=60000\n' >>"$properties"
    fi
done
