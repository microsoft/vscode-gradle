// package com.github.badsyntax.gradletasks.server.handlers;

// import java.io.File;
// import java.util.Map;
// import java.util.logging.Logger;
// import javax.inject.Inject;
// import javax.inject.Singleton;
// import com.github.badsyntax.gradletasks.messages.client.ClientMessage;
// import com.github.badsyntax.gradletasks.server.ConnectionUtil;
// import com.github.badsyntax.gradletasks.server.TaskCancellationPool;
// import com.github.badsyntax.gradletasks.server.handlers.exceptions.MessageHandlerException;
// import org.gradle.tooling.CancellationTokenSource;
// import org.java_websocket.WebSocket;

// @Singleton
// public class StopGetTasksHandler implements MessageHandler {

//     @Inject
//     protected Logger logger;

//     @Inject
//     protected TaskCancellationPool taskPool;

//     @Inject
//     public StopGetTasksHandler() {
//     }

//     private static final String KEY = "ACTION_STOP_GET_TASKS";

//     public String getKey(File sourceDir) {
//         return KEY + sourceDir.getAbsolutePath();
//     }

//     @Override
//     public void handle(WebSocket connection, ClientMessage.Message clientMessage) {
//         try {
//             ClientMessage.StopGetTasks message = clientMessage.getStopGetTasks();
//             File sourceDir = new File(message.getSourceDir().trim());
//             if (!sourceDir.getPath().equals("")) {
//                 if (sourceDir.getAbsolutePath() != null && !sourceDir.exists()) {
//                     throw new MessageHandlerException("Source directory does not exist");
//                 }
//                 String key = GetTasksHandler.getKey(sourceDir);
//                 CancellationTokenSource cancellationTokenSource =
//                         taskPool.get(key, TaskCancellationPool.TYPE.GET);
//                 if (cancellationTokenSource != null) {
//                     cancellationTokenSource.cancel();
//                 }
//             } else {
//                 Map<String, CancellationTokenSource> pool =
//                         taskPool.getPoolType(TaskCancellationPool.TYPE.GET);
//                 pool.keySet().stream().forEach(key -> pool.get(key).cancel());
//             }
//         } catch (MessageHandlerException e) {
//             logger.warning(e.getMessage());
//             ConnectionUtil.sendErrorMessage(connection, e.getMessage());
//         } finally {
//             ConnectionUtil.sendInfoMessage(connection, String.format("Completed %s", KEY));
//         }
//     }
// }
