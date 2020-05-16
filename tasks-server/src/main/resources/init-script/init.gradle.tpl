initscript {
    dependencies {
      classpath files('PLUGIN_PATH')
    }
}

allprojects {
    apply plugin: task.metadata.VsCodeProjectPlugin
}
