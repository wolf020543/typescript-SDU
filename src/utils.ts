/**
 * Returns an AbortSignal that will enter aborted state after `timeoutMs` milliseconds.
 */
export function abortAfterTimeout(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort("Timeout exceeded");
  }, timeoutMs);

  return controller.signal;
}
