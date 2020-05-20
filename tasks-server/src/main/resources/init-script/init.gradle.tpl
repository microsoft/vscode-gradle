initscript {
    dependencies {
      classpath files('PLUGIN_PATH')
    }
}

allprojects {
    apply plugin: com.github.badsyntax.vscodegradleplugin.VsCodeProjectPlugin
}
