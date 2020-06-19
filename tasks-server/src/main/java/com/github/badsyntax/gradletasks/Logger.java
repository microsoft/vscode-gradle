// // See: https://discuss.gradle.org/t/logging-in-gradle-plugin/31685/5

// package com.github.badsyntax.gradletasks;

// import org.gradle.api.logging.LogLevel;
// import org.gradle.api.logging.Logging;
// import org.slf4j.Marker;

// public class Logger implements org.gradle.api.logging.Logger {

//   private static boolean useQuietLogs = false;

//   public static void setUseQuietLogs(boolean useQuietLogs) {
//     Logger.useQuietLogs = useQuietLogs;
//   }

//   public static Logger getLogger(Class aClass) {
//     return new Logger(Logging.getLogger(aClass));
//   }

//   private org.gradle.api.logging.Logger logger;

//   private Logger(org.gradle.api.logging.Logger logger) {
//     this.logger = logger;
//   }

//   @Override
//   public boolean isLifecycleEnabled() {
//     return logger.isLifecycleEnabled();
//   }

//   @Override
//   public String getName() {
//     return logger.getName();
//   }

//   @Override
//   public boolean isTraceEnabled() {
//     return logger.isTraceEnabled();
//   }

//   @Override
//   public void trace(String s) {
//     logger.trace(s);
//   }

//   @Override
//   public void trace(String s, Object o) {
//     logger.trace(s, o);
//   }

//   @Override
//   public void trace(String s, Object o, Object o1) {
//     logger.trace(s, o, o1);
//   }

//   @Override
//   public void trace(String s, Object... objects) {
//     logger.trace(s, objects);
//   }

//   @Override
//   public void trace(String s, Throwable throwable) {
//     logger.trace(s, throwable);
//   }

//   @Override
//   public boolean isTraceEnabled(Marker marker) {
//     return logger.isTraceEnabled(marker);
//   }

//   @Override
//   public void trace(Marker marker, String s) {
//     logger.trace(marker, s);
//   }

//   @Override
//   public void trace(Marker marker, String s, Object o) {
//     logger.trace(marker, s, o);
//   }

//   @Override
//   public void trace(Marker marker, String s, Object o, Object o1) {
//     logger.trace(marker, s, o, o1);
//   }

//   @Override
//   public void trace(Marker marker, String s, Object... objects) {
//     logger.trace(marker, s, objects);
//   }

//   @Override
//   public void trace(Marker marker, String s, Throwable throwable) {
//     logger.trace(marker, s, throwable);
//   }

//   @Override
//   public boolean isDebugEnabled() {
//     return logger.isDebugEnabled();
//   }

//   @Override
//   public void debug(String s) {
//     if (useQuietLogs) {
//       logger.quiet(s);
//     } else {
//       logger.debug(s);
//     }
//   }

//   @Override
//   public void debug(String s, Object o) {
//     if (useQuietLogs) {
//       logger.quiet(s, o);
//     } else {
//       logger.debug(s, o);
//     }
//   }

//   @Override
//   public void debug(String s, Object o, Object o1) {
//     if (useQuietLogs) {
//       logger.quiet(s, o, o1);
//     } else {
//       logger.debug(s, o, o1);
//     }
//   }

//   @Override
//   public void debug(String message, Object... objects) {
//     if (useQuietLogs) {
//       logger.quiet(message, objects);
//     } else {
//       logger.debug(message, objects);
//     }
//   }

//   @Override
//   public void debug(String s, Throwable throwable) {
//     if (useQuietLogs) {
//       logger.quiet(s, throwable);
//     } else {
//       logger.debug(s, throwable);
//     }
//   }

//   @Override
//   public boolean isDebugEnabled(Marker marker) {
//     return logger.isDebugEnabled(marker);
//   }

//   @Override
//   public void debug(Marker marker, String s) {
//     logger.debug(marker, s);
//   }

//   @Override
//   public void debug(Marker marker, String s, Object o) {
//     logger.debug(marker, s, o);
//   }

//   @Override
//   public void debug(Marker marker, String s, Object o, Object o1) {
//     logger.debug(marker, s, o, o1);
//   }

//   @Override
//   public void debug(Marker marker, String s, Object... objects) {
//     logger.debug(marker, s, objects);
//   }

//   @Override
//   public void debug(Marker marker, String s, Throwable throwable) {
//     logger.debug(marker, s, throwable);
//   }

//   @Override
//   public boolean isInfoEnabled() {
//     return logger.isInfoEnabled();
//   }

//   @Override
//   public void info(String s) {
//     if (useQuietLogs) {
//       logger.quiet(s);
//     } else {
//       logger.info(s);
//     }
//   }

//   @Override
//   public void info(String s, Object o) {
//     if (useQuietLogs) {
//       logger.quiet(s, o);
//     } else {
//       logger.info(s, o);
//     }
//   }

//   @Override
//   public void info(String s, Object o, Object o1) {
//     if (useQuietLogs) {
//       logger.quiet(s, o, o1);
//     } else {
//       logger.info(s, o, o1);
//     }
//   }

//   @Override
//   public void lifecycle(String message) {
//     if (useQuietLogs) {
//       logger.quiet(message);
//     } else {
//       logger.lifecycle(message);
//     }
//   }

//   @Override
//   public void lifecycle(String message, Object... objects) {
//     if (useQuietLogs) {
//       logger.quiet(message, objects);
//     } else {
//       logger.lifecycle(message, objects);
//     }
//   }

//   @Override
//   public void lifecycle(String message, Throwable throwable) {
//     if (useQuietLogs) {
//       logger.quiet(message, throwable);
//     } else {
//       logger.lifecycle(message, throwable);
//     }
//   }

//   @Override
//   public boolean isQuietEnabled() {
//     return logger.isQuietEnabled();
//   }

//   @Override
//   public void quiet(String message) {
//     logger.quiet(message);
//   }

//   @Override
//   public void quiet(String message, Object... objects) {
//     logger.quiet(message, objects);
//   }

//   @Override
//   public void info(String message, Object... objects) {
//     if (useQuietLogs) {
//       logger.quiet(message, objects);
//     } else {
//       logger.info(message, objects);
//     }
//   }

//   @Override
//   public void info(String s, Throwable throwable) {
//     if (useQuietLogs) {
//       logger.quiet(s, throwable);
//     } else {
//       logger.info(s, throwable);
//     }
//   }

//   @Override
//   public boolean isInfoEnabled(Marker marker) {
//     return logger.isInfoEnabled();
//   }

//   @Override
//   public void info(Marker marker, String s) {
//     logger.info(marker, s);
//   }

//   @Override
//   public void info(Marker marker, String s, Object o) {
//     logger.info(marker, s, o);
//   }

//   @Override
//   public void info(Marker marker, String s, Object o, Object o1) {
//     logger.info(marker, s, o, o1);
//   }

//   @Override
//   public void info(Marker marker, String s, Object... objects) {
//     logger.info(marker, s, objects);
//   }

//   @Override
//   public void info(Marker marker, String s, Throwable throwable) {
//     logger.info(marker, s, throwable);
//   }

//   @Override
//   public boolean isWarnEnabled() {
//     return logger.isWarnEnabled();
//   }

//   @Override
//   public void warn(String s) {
//     if (useQuietLogs) {
//       logger.quiet(s);
//     } else {
//       logger.warn(s);
//     }
//   }

//   @Override
//   public void warn(String s, Object o) {
//     if (useQuietLogs) {
//       logger.quiet(s, o);
//     } else {
//       logger.warn(s, o);
//     }
//   }

//   @Override
//   public void warn(String s, Object... objects) {
//     if (useQuietLogs) {
//       logger.quiet(s, objects);
//     } else {
//       logger.warn(s, objects);
//     }
//   }

//   @Override
//   public void warn(String s, Object o, Object o1) {
//     if (useQuietLogs) {
//       logger.quiet(s, o, o1);
//     } else {
//       logger.warn(s, o, o1);
//     }
//   }

//   @Override
//   public void warn(String s, Throwable throwable) {
//     if (useQuietLogs) {
//       logger.quiet(s, throwable);
//     } else {
//       logger.warn(s, throwable);
//     }
//   }

//   @Override
//   public boolean isWarnEnabled(Marker marker) {
//     return logger.isWarnEnabled(marker);
//   }

//   @Override
//   public void warn(Marker marker, String s) {
//     logger.warn(marker, s);
//   }

//   @Override
//   public void warn(Marker marker, String s, Object o) {
//     logger.warn(marker, s, o);
//   }

//   @Override
//   public void warn(Marker marker, String s, Object o, Object o1) {
//     logger.warn(marker, s, o, o1);
//   }

//   @Override
//   public void warn(Marker marker, String s, Object... objects) {
//     logger.warn(marker, s, objects);
//   }

//   @Override
//   public void warn(Marker marker, String s, Throwable throwable) {
//     logger.warn(marker, s, throwable);
//   }

//   @Override
//   public boolean isErrorEnabled() {
//     return logger.isErrorEnabled();
//   }

//   @Override
//   public void error(String s) {
//     if (useQuietLogs) {
//       logger.quiet(s);
//     } else {
//       logger.error(s);
//     }
//   }

//   @Override
//   public void error(String s, Object o) {
//     if (useQuietLogs) {
//       logger.quiet(s, o);
//     } else {
//       logger.error(s, o);
//     }
//   }

//   @Override
//   public void error(String s, Object o, Object o1) {
//     if (useQuietLogs) {
//       logger.quiet(s, o, o1);
//     } else {
//       logger.error(s, o, o1);
//     }
//   }

//   @Override
//   public void error(String s, Object... objects) {}

//   @Override
//   public void error(String s, Throwable throwable) {
//     if (useQuietLogs) {
//       logger.quiet(s, throwable);
//     } else {
//       logger.error(s, throwable);
//     }
//   }

//   @Override
//   public boolean isErrorEnabled(Marker marker) {
//     return logger.isErrorEnabled(marker);
//   }

//   @Override
//   public void error(Marker marker, String s) {
//     logger.error(marker, s);
//   }

//   @Override
//   public void error(Marker marker, String s, Object o) {
//     logger.error(marker, s, o);
//   }

//   @Override
//   public void error(Marker marker, String s, Object o, Object o1) {
//     logger.error(marker, s, o, o1);
//   }

//   @Override
//   public void error(Marker marker, String s, Object... objects) {
//     logger.error(marker, s, objects);
//   }

//   @Override
//   public void error(Marker marker, String s, Throwable throwable) {
//     logger.error(marker, s, throwable);
//   }

//   @Override
//   public void quiet(String message, Throwable throwable) {
//     logger.quiet(message, throwable);
//   }

//   @Override
//   public boolean isEnabled(LogLevel level) {
//     return logger.isEnabled(level);
//   }

//   @Override
//   public void log(LogLevel level, String message) {
//     logger.log(level, message);
//   }

//   @Override
//   public void log(LogLevel level, String message, Object... objects) {
//     logger.log(level, message, objects);
//   }

//   @Override
//   public void log(LogLevel level, String message, Throwable throwable) {
//     logger.log(level, message, throwable);
//   }
// }
