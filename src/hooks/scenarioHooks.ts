import { event } from 'codeceptjs';

import { Logger } from '../core/logger/Logger';

// ─── Per-test start-time registry ────────────────────────────────────────────
// CodeceptJS sets test.duration = 0 for failed tests at the moment
// event.test.failed fires, so we track wall-clock start ourselves.

const startTimes = new Map<string, number>();

function testKey(test: Mocha.Test): string {
  const suite = (test.parent?.title ?? '').trim();
  const title = (test.title ?? 'unknown').trim();
  return suite ? `${suite} > ${title}` : title;
}

/** Wraps a hook callback so that an exception inside it never crashes the runner. */
function safe(label: string, fn: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    try {
      fn(...args);
    } catch (err) {
      Logger.error('hook.error', { hook: label, error: (err as Error).message });
    }
  };
}

// ─── Suite-level ─────────────────────────────────────────────────────────────

event.dispatcher.on(
  event.suite.before,
  safe('suite.before', (suite: unknown) => {
    const s = suite as Mocha.Suite;
    const title = s.title?.trim();
    if (!title) return; // skip empty root suite
    Logger.info('suite.start', { suite: title });
  }),
);

event.dispatcher.on(
  event.suite.after,
  safe('suite.after', (suite: unknown) => {
    const s = suite as Mocha.Suite;
    const title = s.title?.trim();
    if (!title) return;
    const total = s.tests?.length ?? 0;
    const passed = s.tests?.filter((t) => t.state === 'passed').length ?? 0;
    const failed = s.tests?.filter((t) => t.state === 'failed').length ?? 0;
    const pending = s.tests?.filter((t) => t.pending).length ?? 0;
    Logger.info('suite.end', { suite: title, total, passed, failed, pending });
  }),
);

// ─── Test-level ───────────────────────────────────────────────────────────────

event.dispatcher.on(
  event.test.before,
  safe('test.before', (test: unknown) => {
    const t = test as Mocha.Test;
    const key = testKey(t);
    startTimes.set(key, Date.now());
    Logger.info('test.start', {
      test: t.title,
      suite: t.parent?.title,
      // Present when CodeceptJS retries a failed test.
      attempt: (t as unknown as Record<string, unknown>).retryNum ?? 0,
    });
  }),
);

event.dispatcher.on(
  event.test.passed,
  safe('test.passed', (test: unknown) => {
    const t = test as Mocha.Test;
    const key = testKey(t);
    const durationMs = Date.now() - (startTimes.get(key) ?? Date.now());
    startTimes.delete(key);
    Logger.info('test.pass', { test: t.title, suite: t.parent?.title, durationMs });
  }),
);

event.dispatcher.on(
  event.test.failed,
  safe('test.failed', (test: unknown, err: unknown) => {
    const t = test as Mocha.Test;
    const e = err as Record<string, unknown>;
    const key = testKey(t);
    const durationMs = Date.now() - (startTimes.get(key) ?? Date.now());
    startTimes.delete(key);

    // CodeceptJS/Mocha error objects sometimes have empty .message but carry
    // the real reason in .actual/.expected (assertion diff).
    // Avoid String(err) — plain objects stringify as '[object Object]'.
    const rawMsg = (e?.message as string) ?? '';
    const fallback = rawMsg || (e?.stack as string)?.split('\n')[0] || 'unknown error';

    Logger.error('test.fail', {
      test: t.title,
      suite: t.parent?.title,
      durationMs,
      error: fallback,
      // Playwright assertion failures expose actual/expected for quick diff.
      ...(e?.actual !== undefined && { actual: e.actual }),
      ...(e?.expected !== undefined && { expected: e.expected }),
      // Stack may be absent for non-Error throws (e.g. throw 'string').
      stack: (e?.stack as string) ?? undefined,
    });
  }),
);

event.dispatcher.on(
  event.test.skipped,
  safe('test.skipped', (test: unknown) => {
    const t = test as Mocha.Test;
    startTimes.delete(testKey(t));
    Logger.warn('test.skip', { test: t.title, suite: t.parent?.title });
  }),
);

// ─── Step-level (debug only — suppress in default runs) ───────────────────────

event.dispatcher.on(
  event.step.before,
  safe('step.before', (step: unknown) => {
    const s = step as CodeceptJS.Step;
    Logger.debug('step.start', { step: s.toString() });
  }),
);

event.dispatcher.on(
  event.step.passed,
  safe('step.passed', (step: unknown) => {
    const s = step as CodeceptJS.Step;
    Logger.debug('step.pass', { step: s.toString() });
  }),
);

event.dispatcher.on(
  event.step.failed,
  safe('step.failed', (step: unknown) => {
    const s = step as CodeceptJS.Step;
    // Always log at error level — this is the exact step that caused the failure.
    Logger.error('step.fail', { step: s.toString() });
  }),
);
