/**
 * `useMonthlyGrid` — fetch + retry hook for the Matrix Kehadiran page.
 *
 * Wraps a single GET request to `/api/monthly-grid?month=N&year=Y` and
 * exposes the lifecycle plus a manual `retry` callback to the UI layer.
 *
 * Behavior summary (design §"Data fetch — useMonthlyGrid"):
 *   1. Calls `axios.get('/api/monthly-grid', { params, signal })`.
 *   2. An `AbortController` cancels the in-flight request when:
 *        - `month` or `year` props change between renders, or
 *        - the component unmounts.
 *   3. Retry policy on transient failures:
 *        - delays: `[500, 1500, 3500]` ms (3 retries, exponential-ish)
 *        - 4xx errors: surfaced immediately (no retry)
 *        - axios `CanceledError`: NOT surfaced as a user-facing error
 *   4. Manual `retry()` resets the attempt counter and re-fires the
 *      request immediately.
 *   5. Defensive validation: if the period is out of range
 *      (`month ∉ [1..12]` or `year ∉ [1900..2100]`), the hook bails
 *      out into `status='error'` with a clear Indonesian message and
 *      issues no network call.
 *
 * Implementation notes:
 *   - `useState` owns the four exposed result fields (status, data,
 *     error, lastUpdated).
 *   - Refs hold the live `AbortController` and the retry-delay timer
 *     so cleanup remains synchronous and never depends on stale
 *     closures.
 *   - The fetch effect re-runs when either `month`, `year`, or the
 *     internal `retryToken` changes. Bumping `retryToken` from the
 *     `retry` callback restarts the lifecycle from attempt 0.
 *
 * Design reference:
 *   .kiro/specs/matrix-kehadiran-dark-redesign/design.md
 *     §"Data fetch — useMonthlyGrid"
 *
 * Requirements: 13.1, 13.3, 13.4, 13.5.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { AxiosError } from 'axios';

import type { BackendMonthlyGridResponse } from '../types';

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * Result shape returned by `useMonthlyGrid`. Status transitions:
 *   `idle` → `loading` → `loaded` (success path)
 *   `idle` → `loading` → `error`  (transient failure or 4xx)
 *
 * The hook starts in `idle` only momentarily before the initial effect
 * dispatches `loading`; consumers can treat `idle` and `loading` as a
 * single "still working" bucket.
 */
export interface UseMonthlyGridResult {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  data: BackendMonthlyGridResponse | null;
  error: string | null;
  lastUpdated: Date | null;
  retry: () => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Back-off schedule (in milliseconds) applied between retry attempts.
 * The number of entries determines the maximum number of retries
 * AFTER the first attempt — so the request is attempted up to
 * `RETRY_DELAYS_MS.length + 1` times in total.
 */
const RETRY_DELAYS_MS = [500, 1500, 3500] as const;

/** User-visible Indonesian error message for an invalid period. */
const INVALID_PERIOD_MESSAGE = 'Bulan atau tahun tidak valid.';

/** Generic Indonesian error message used as a final fallback. */
const GENERIC_FETCH_ERROR =
  'Gagal memuat data kehadiran. Silakan coba lagi.';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Deduce whether an axios failure is transient (network / timeout /
 * 5xx) and therefore worth retrying. Cancellations are NEVER retried —
 * a cancellation always means the caller (us) has moved on.
 */
function shouldRetry(error: AxiosError): boolean {
  if (axios.isCancel(error)) return false;
  // No `response` field → network or timeout failure → retry.
  if (!error.response) return true;
  const s = error.response.status;
  return s >= 500 && s < 600;
}

/**
 * Validate the period at the boundary so we surface a precise error
 * without spending a network round trip on a guaranteed-bad request.
 */
function isValidPeriod(month: number, year: number): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return false;
  return true;
}

/**
 * Best-effort extraction of a human-readable error message from an
 * axios failure. Falls back to a generic Indonesian message so the
 * UI never displays an empty error state.
 */
function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (response?.data) {
      const body = response.data as { error?: unknown; message?: unknown };
      if (typeof body.error === 'string' && body.error.length > 0) {
        return body.error;
      }
      if (typeof body.message === 'string' && body.message.length > 0) {
        return body.message;
      }
    }
    if (typeof error.message === 'string' && error.message.length > 0) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return GENERIC_FETCH_ERROR;
}

// ─── Hook ──────────────────────────────────────────────────────────────────

/**
 * Subscribe to `/api/monthly-grid` for the given period.
 *
 * @param month 1..12 (NOT 0-indexed)
 * @param year  4-digit calendar year, expected in `[1900, 2100]`
 */
export function useMonthlyGrid(
  month: number,
  year: number,
): UseMonthlyGridResult {
  const [status, setStatus] = useState<UseMonthlyGridResult['status']>('idle');
  const [data, setData] = useState<BackendMonthlyGridResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /**
   * Bumping `retryToken` is the public mechanism to force the fetch
   * effect to re-run from scratch. The value itself is meaningless —
   * only its identity matters.
   */
  const [retryToken, setRetryToken] = useState(0);

  /**
   * Live AbortController for the in-flight request. We keep it on a
   * ref so the cleanup function can read the latest controller
   * without participating in the effect's dependency array.
   */
  const controllerRef = useRef<AbortController | null>(null);

  /**
   * Active back-off timer id (if any). Stored on a ref so cleanup
   * cancels a pending retry the moment the period changes or the
   * component unmounts.
   */
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const retry = useCallback(() => {
    setRetryToken((t) => t + 1);
  }, []);

  useEffect(() => {
    // Defensive validation — bail out before any network activity.
    if (!isValidPeriod(month, year)) {
      setStatus('error');
      setError(INVALID_PERIOD_MESSAGE);
      setData(null);
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const clearRetryTimer = () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const runAttempt = async (): Promise<void> => {
      // Abort any prior in-flight request before starting a new one.
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
      const controller = new AbortController();
      controllerRef.current = controller;

      // Mark loading on the first attempt; subsequent retry attempts
      // remain in `loading` (no `idle` flicker between back-offs).
      setStatus('loading');
      setError(null);

      try {
        const response = await axios.get<BackendMonthlyGridResponse>(
          '/api/monthly-grid',
          {
            params: { month, year },
            signal: controller.signal,
          },
        );

        if (cancelled) return;

        setData(response.data);
        setLastUpdated(new Date());
        setError(null);
        setStatus('loaded');
      } catch (err: unknown) {
        if (cancelled) return;

        // Cancellation (caller moved on) — never surface, never retry.
        if (axios.isCancel(err)) return;

        const axiosError = axios.isAxiosError(err)
          ? (err as AxiosError)
          : null;

        const canRetry =
          axiosError !== null &&
          shouldRetry(axiosError) &&
          attempt < RETRY_DELAYS_MS.length;

        if (canRetry) {
          const delay = RETRY_DELAYS_MS[attempt];
          attempt += 1;
          clearRetryTimer();
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            if (cancelled) return;
            void runAttempt();
          }, delay);
          return;
        }

        // Terminal failure: surface to the UI.
        setError(describeError(err));
        setStatus('error');
      }
    };

    void runAttempt();

    return () => {
      cancelled = true;
      clearRetryTimer();
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
    };
  }, [month, year, retryToken]);

  return { status, data, error, lastUpdated, retry };
}
