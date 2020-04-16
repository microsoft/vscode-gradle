# How Does it Work?

The extension uses client/server architecture using gRPC as the interface between the client and the server, and is a similar architecture to the language-server protocol.

On extension activate, the client starts the Java gRPC server which remains running for the period the extension is activated. A long running server provides very good performance.

Protobuf buffers are used to define the messages and provides consistent abstractions on the server & client, provides strict typing and is quicker than JSON to serialise and deserilase the messages. The Java & JavaScript message classes, as well as the client and server interfaces, are generated from the protobuf files via the protoc compiler using the gRPC plugin. TypeScript classes are generated from the generated JavaScript classes, so everything is nicely typed.

The Java server uses the Gradle Tooling Api to discover projects & tasks, and run Gradle tasks.

## Discovering Projects & Tasks

Tasks belong to projects and projects are hierarchical, meaning projects can have sub-projects, and any/all projects in the tree can have tasks.

The gRPC server provides a `getProject` endpoint to provide this hierarchincal data structure, and accepts a `sourceDir` argument, which the client provides.

As the extension supports multi-projects _and_ nested projects, the client needs to know the difference between the two.

A root project (`sourceDir`) is defined by having a gradle wrapper script at the root (`gradlew` or `gradlew.bat`). It can't simply look for `build.gradle`, as sub-projects will also have this build file.

Once the client has discovered all the root projects, it will request project data for each root project (as seperate gRPC calls). Gradle progress and output (`STDERR` & `STDOUT`) are streamed to the client. Once the project is streamed to the client, it builds a single-dimensional list of vscode tasks from the Gradle project tasks. These vscode tasks have definitions that contain all the relevant task & project information.

The extension models the project hierarchical structure using the vscode treeView. The treeview data provider consumes the vscode tasks, and builds a tree of projects & tasks using the information provided in the task definitions.

## Running Tasks

Gradle tasks can be run through either the treeview or via the command pallete.

The tasks use the gRPC client to call the `runTask` gRPC server endpoint. Similar to getting project data, Gradle progress and output (`STDERR` & `STDOUT`) is streamed to the client. Tasks are run in a custom vscode terminal.

## The Build System

Gradle is used as the build system for the extension. Gradle will compile the Java & Protobuff files and run the relevant tasks to correctly build all the dependencies of the project.

Getting started on this extension is as simple as `./gradlew build`.
