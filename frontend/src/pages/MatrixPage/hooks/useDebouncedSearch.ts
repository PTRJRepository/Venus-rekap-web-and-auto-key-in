import { useEffect, useState } from 'react';

/**
 * useDebouncedSearch
 *
 * Returns a debounced copy of `value`. The debounced value mirrors the input
 * after the input has been stable for `delayMs` milliseconds.
 *
 * On mount the returned value equals the current `value` immediately (no
 * artificial delay on first render). Subsequent updates are debounced.
 *
 * Generic over `T` so it works for primitives (strings, numbers) as well as
 * any other reference type a caller might want to debounce.
 *
 * @param value   The latest value to debounce.
 * @param delayMs Debounce window in milliseconds. Defaults to 150.
 */
export function useDebouncedSearch<T>(value: T, delayMs: number = 150): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
