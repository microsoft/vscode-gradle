package com.github.badsyntax.gradletasks;

import java.util.logging.ConsoleHandler;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.logging.StreamHandler;
import com.github.badsyntax.gradletasks.logging.BasicWriteFormatter;
import com.github.badsyntax.gradletasks.server.GradleTaskPool;
import dagger.Module;
import dagger.Provides;

@Module
public class ApplicationModule {
  private ApplicationModule() {
  }

  @Provides
  static Logger provideLogger() {
    StreamHandler logHandler = new ConsoleHandler();
    logHandler.setFormatter(new BasicWriteFormatter());
    logHandler.setLevel(Level.ALL);

    Logger logger = Logger.getLogger("Application");
    logger.setUseParentHandlers(false);
    logger.addHandler(logHandler);

    return logger;
  }

  @Provides
  static GradleTaskPool provideTaskPool() {
    return new GradleTaskPool();
  }
}
