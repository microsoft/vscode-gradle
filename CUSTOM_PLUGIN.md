# Custom Gradle Plugin

I need to add a custom Gradle plugin to the target build in order to popular a custom build model in order to provide extra task metadata (like task type).

This custom plugin cannot be part of the the main server build as it needs to be added to the target build. Thus it needs to be a seperate consumable jar file.

## Jar location

The plugin project can be a sub-project of the main extension but needs to be

## Approach

- Pass in absolute location of jar file as argument
- Dynamically generate init.gradle at runtime that points to location of jar file

