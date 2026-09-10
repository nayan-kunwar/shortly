/**
 * Shared polling helper for async assertions (outbox append is
 * fire-and-forget; broker delivery is eventual). Rejects on timeout.
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 100,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await condition()) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`waitFor timed out after ${String(timeoutMs)}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
