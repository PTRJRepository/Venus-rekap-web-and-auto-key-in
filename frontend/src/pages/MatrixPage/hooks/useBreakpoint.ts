/**
 * `useBreakpoint` — derives the current layout breakpoint from
 * `window.innerWidth` and the visible month's `daysInMonth`.
 *
 * Returns one of `'wide' | 'standard' | 'narrow'` via the pure
 * `resolveBreakpoint` function in `../domain/layout`.
 *
 * Implementation notes:
 *   - Uses `useSyncExternalStore` so the snapshot is read on every
 *     render and stays consistent during concurrent rendering.
 *   - Subscribes to `window.matchMedia('(min-width: 1440px)')` and
 *     `'(min-width: 1336px)'`. Either crossing triggers a re-render.
 *   - `daysInMonth` is captured by the `getSnapshot` closure and
 *     re-evaluated on every render — no media-query listener is
 *     required to react to month changes.
 *   - SSR / non-browser environments return `'wide'` as a safe default.
 *   - If `window.matchMedia` is missing (older jsdom builds), the
 *     subscribe function no-ops gracefully without throwing.
 *
 * Design reference:
 *   .kiro/specs/matrix-kehadiran-dark-redesign/design.md
 *     §"Responsive breakpoints" → Detection
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4.
 */

import { useSyncExternalStore } from 'react';
import { resolveBreakpoint, type Breakpoint } from '../domain/layout';

/** Media queries whose `change` events should re-emit the breakpoint. */
const BREAKPOINT_MEDIA_QUERIES = [
  '(min-width: 1440px)',
  '(min-width: 1336px)',
] as const;

/**
 * Subscribe to media-query crossings. Returns a cleanup function that
 * removes every listener. Stable reference (defined at module scope) so
 * `useSyncExternalStore` does not re-subscribe on every render.
 */
function subscribeToBreakpointChanges(callback: () => void): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => {};
  }

  const mediaQueryLists = BREAKPOINT_MEDIA_QUERIES.map((query) =>
    window.matchMedia(query),
  );

  for (const mql of mediaQueryLists) {
    mql.addEventListener('change', callback);
  }

  return () => {
    for (const mql of mediaQueryLists) {
      mql.removeEventListener('change', callback);
    }
  };
}

/** SSR snapshot: assume the largest layout. */
function getServerSnapshot(): Breakpoint {
  return 'wide';
}

/**
 * Subscribe a React component to the current layout breakpoint.
 *
 * Re-renders when `window.matchMedia('(min-width: 1440px)')` or
 * `'(min-width: 1336px)'` changes, and recomputes synchronously on
 * every render so `daysInMonth` updates take effect immediately.
 */
export function useBreakpoint(daysInMonth: number): Breakpoint {
  const getSnapshot = (): Breakpoint => {
    if (typeof window === 'undefined') return 'wide';
    return resolveBreakpoint(window.innerWidth, daysInMonth);
  };

  return useSyncExternalStore(
    subscribeToBreakpointChanges,
    getSnapshot,
    getServerSnapshot,
  );
}
