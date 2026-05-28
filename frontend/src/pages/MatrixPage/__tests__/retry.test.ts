/**
 * Retry / abort tests for `useMonthlyGrid`.
 *
 * Test stack: Vitest + @testing-library/react.
 *
 * Coverage:
 *   1. 500 → 200 — retry policy resolves to `loaded` after one back-off.
 *   2. 4xx — surfaces immediately as `error` with exactly one network
 *      call (no retry on client errors).
 *   3. Abort on month change — re-rendering with a new `month` aborts
 *      the in-flight request so its eventual resolution does NOT
 *      overwrite the state for the new month.
 *   4. Manual retry — calling `retry()` after an error fires a fresh
 *      request.
 *
 * Implementation notes:
 *   - `vi.useFakeTimers()` is used to step through the retry back-off
 *     deterministically. Because `waitFor` itself relies on
 *     `setTimeout`, the assertions sit inside `act(...)` blocks
 *     followed by `vi.advanceTimersByTimeAsync(...)` — no `waitFor`.
 *   - `axios` is mocked via `vi.mock('axios')`. The two helper
 *     predicates (`isCancel`, `isAxiosError`) need real-ish behavior
 *     for the hook's branching to work, so the `beforeEach` rebinds
 *     them to lightweight implementations.
 *
 * Validates: Requirements 13.3, 13.4.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import axios from 'axios';

import { useMonthlyGrid } from '../hooks/useMonthlyGrid';

vi.mock('axios');

// ─── Test fixtures ─────────────────────────────────────────────────────────

/**
 * Minimal `BackendMonthlyGridResponse`-shaped payload used for the
 * happy-path success branches. Only the fields actually inspected by
 * the assertions need to be present.
 */
const SUCCESS_PAYLOAD = {
  success: true,
  year: 2026,
  month: 5,
  month_name: 'Mei',
  days_in_month: 31,
  total_employees: 0,
  date_range: '2026-05-01..2026-05-31',
  data_availability: {
    latest_available_date: '2026-05-31',
    available_days_count: 31,
    total_days_in_month: 31,
    has_unavailable_dates: false,
  },
  grid_data: [],
};

/** Build a synthetic axios error with a given HTTP status code. */
function buildHttpError(status: number) {
  const error = new Error(`Request failed with status code ${status}`) as Error & {
    isAxiosError: boolean;
    response: { status: number; data: { error: string } };
    config: Record<string, unknown>;
  };
  error.isAxiosError = true;
  error.response = { status, data: { error: `Mock ${status}` } };
  error.config = {};
  return error;
}

/**
 * Flush all pending promise microtasks. We call this between awaited
 * timer advances so chained `.then` handlers (rejection → retry
 * scheduling, resolution → state update) all get a chance to run
 * before the next assertion.
 */
async function flushMicrotasks(): Promise<void> {
  // Two passes cover state-update → effect-cleanup chains.
  await Promise.resolve();
  await Promise.resolve();
}

// ─── Mocking helpers ───────────────────────────────────────────────────────

/**
 * Cast the auto-mocked axios surface to vi-mock-aware functions. The
 * `vi.mock('axios')` call above replaces every export with `vi.fn()`;
 * we restore real-ish behavior for the two predicates so the hook can
 * branch on them.
 */
const mockedAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  isCancel: ReturnType<typeof vi.fn>;
  isAxiosError: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.useFakeTimers();
  mockedAxios.get = vi.fn();
  mockedAxios.isCancel = vi.fn(
    (err: unknown) =>
      err !== null &&
      typeof err === 'object' &&
      ((err as { name?: string }).name === 'CanceledError' ||
        (err as { message?: string }).message === 'canceled'),
  );
  mockedAxios.isAxiosError = vi.fn(
    (err: unknown) =>
      err !== null &&
      typeof err === 'object' &&
      (err as { isAxiosError?: boolean }).isAxiosError === true,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('useMonthlyGrid — retry policy', () => {
  it('retries once after a 500 response and resolves to `loaded`', async () => {
    mockedAxios.get
      .mockRejectedValueOnce(buildHttpError(500))
      .mockResolvedValueOnce({ data: SUCCESS_PAYLOAD });

    const { result } = renderHook(() => useMonthlyGrid(5, 2026));

    // Flush the initial effect + the rejected promise from attempt #1.
    await act(async () => {
      await flushMicrotasks();
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('loading');

    // Advance past the first back-off (500 ms) — fires the retry
    // setTimeout, which schedules attempt #2.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await flushMicrotasks();
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('loaded');
    expect(result.current.data).toEqual(SUCCESS_PAYLOAD);
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdated).toBeInstanceOf(Date);
  });

  it('does NOT retry on 4xx and surfaces the error immediately', async () => {
    mockedAxios.get.mockRejectedValueOnce(buildHttpError(400));

    const { result } = renderHook(() => useMonthlyGrid(5, 2026));

    await act(async () => {
      await flushMicrotasks();
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');
    expect(result.current.data).toBeNull();
    expect(result.current.error).not.toBeNull();

    // Advance well past every retry-delay slot to confirm there is
    // no follow-up attempt scheduled.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await flushMicrotasks();
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});

describe('useMonthlyGrid — abort on prop change', () => {
  it('aborts the in-flight request when month changes mid-flight', async () => {
    // Track whether each call's abort signal fires.
    const abortFlags: boolean[] = [];

    mockedAxios.get.mockImplementation(
      (_url: string, config: { signal?: AbortSignal }) => {
        const callIndex = abortFlags.length;
        abortFlags.push(false);

        return new Promise((resolve, reject) => {
          const cancelError = Object.assign(new Error('canceled'), {
            name: 'CanceledError',
          });

          if (config.signal?.aborted) {
            abortFlags[callIndex] = true;
            reject(cancelError);
            return;
          }
          config.signal?.addEventListener('abort', () => {
            abortFlags[callIndex] = true;
            reject(cancelError);
          });

          // The FIRST call lingers (resolved only after a 1 s timer)
          // so the test can race a re-render against it. The SECOND
          // call resolves immediately with the new period's payload.
          if (callIndex === 0) {
            setTimeout(() => {
              if (!config.signal?.aborted) {
                resolve({ data: SUCCESS_PAYLOAD });
              }
            }, 1000);
          } else {
            resolve({ data: { ...SUCCESS_PAYLOAD, month: 6 } });
          }
        });
      },
    );

    const { result, rerender } = renderHook(
      ({ month }: { month: number }) => useMonthlyGrid(month, 2026),
      { initialProps: { month: 5 } },
    );

    // Let the first effect schedule the first axios.get().
    await act(async () => {
      await flushMicrotasks();
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    // Re-render with a different month before the first promise
    // resolves — this MUST abort the first request.
    await act(async () => {
      rerender({ month: 6 });
      await flushMicrotasks();
    });

    expect(abortFlags[0]).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);

    // Drain any timers tied to the (already-aborted) first call so we
    // can assert the state reflects the second call only.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await flushMicrotasks();
    });

    expect(result.current.status).toBe('loaded');
    expect(result.current.data?.month).toBe(6);
  });
});

describe('useMonthlyGrid — manual retry', () => {
  it('re-fires the request when retry() is called after an error', async () => {
    mockedAxios.get
      .mockRejectedValueOnce(buildHttpError(400))
      .mockResolvedValueOnce({ data: SUCCESS_PAYLOAD });

    const { result } = renderHook(() => useMonthlyGrid(5, 2026));

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.status).toBe('error');
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.retry();
      await flushMicrotasks();
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('loaded');
    expect(result.current.data).toEqual(SUCCESS_PAYLOAD);
  });
});
