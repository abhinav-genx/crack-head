/** Print a clean, single-line error to the user instead of leaking a raw stack trace. */
export const logError = (context: string | undefined, err: unknown): void => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    `crack-head error${context ? ` (${context})` : ""}: ${message}`,
  );
};

/** Register process-wide handlers so ANY otherwise-unhandled error is logged, then exit non-zero. */
export const installGlobalErrorHandlers = (): void => {
  process.on("uncaughtException", (err) => {
    logError("uncaught", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logError("unhandledRejection", reason);
    process.exit(1);
  });
};

/** Wrap a command action so any thrown error is logged cleanly and exits non-zero. */
export const runAction =
  (fn: (...args: any[]) => void) =>
  (...args: any[]): void => {
    try {
      fn(...args);
    } catch (err) {
      logError(undefined, err);
      process.exit(1);
    }
  };
