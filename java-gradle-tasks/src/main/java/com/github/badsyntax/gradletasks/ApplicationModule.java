package com.github.badsyntax.gradletasks;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.ConsoleHandler;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.logging.StreamHandler;
import javax.inject.Singleton;
import com.github.badsyntax.gradletasks.logging.BasicWriteFormatter;
import com.github.badsyntax.gradletasks.messages.client.ClientMessage.Message.KindCase;
import com.github.badsyntax.gradletasks.server.MessageRouter;
import com.github.badsyntax.gradletasks.server.handlers.GetTasksHandler;
import com.github.badsyntax.gradletasks.server.handlers.RunTaskHandler;
import com.github.badsyntax.gradletasks.server.handlers.StopGetTasksHandler;
import com.github.badsyntax.gradletasks.server.handlers.StopTaskHandler;
import dagger.Module;
import dagger.Provides;

@Module
public class ApplicationModule {
  private ApplicationModule() {
  }

  @Provides
  @Singleton
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
  @Singleton
  static ExecutorService provideExecutorService() {
    return Executors.newCachedThreadPool();
  }

  @Provides
  @Singleton
  static MessageRouter provideMessageRouter(RunTaskHandler runTask, GetTasksHandler getTasks,
      StopTaskHandler stopTask, StopGetTasksHandler stopGetTasks) {
    MessageRouter messageRouter = new MessageRouter();
    messageRouter.registerHandler(KindCase.RUN_TASK, runTask);
    messageRouter.registerHandler(KindCase.GET_TASKS, getTasks);
    messageRouter.registerHandler(KindCase.STOP_TASK, stopTask);
    messageRouter.registerHandler(KindCase.STOP_GET_TASKS, stopGetTasks);
    return messageRouter;
  }
}
