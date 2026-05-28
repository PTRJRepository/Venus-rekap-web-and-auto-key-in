/**
 * Property-based tests for `domain/statusMapping.ts`.
 *
 * Test stack: Vitest + fast-check.
 *
 * Property 1 — Status mapping bijection on the canonical set
 * Property 2 — Status presentation registry totality
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10, 10.2, 12.2, 13.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { tokens } from '../tokens';
import type { AttendanceStatus } from '../types';
import {
  CANONICAL_TOKENS,
  OFF_COLOR,
  attendanceStatusToLabel,
  getStatusColor,
  getStatusIcon,
  mapBackendStatus,
  reverseToCanonical,
} from '../domain/statusMapping';

/** All six statuses in the closed `AttendanceStatus` domain. */
const ATTENDANCE_STATUSES = [
  'present',
  'alpha',
  'leave',
  'sick',
  'late',
  'off',
] as const satisfies readonly AttendanceStatus[];

/**
 * Randomize the case of a string character-by-character. Used to assert
 * `mapBackendStatus` is case-insensitive.
 */
function randomizeCase(s: string, mask: readonly boolean[]): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const upper = mask[i % mask.length] ?? false;
    out += upper ? ch.toUpperCase() : ch.toLowerCase();
  }
  return out;
}

describe('Property 1: Status mapping bijection on the canonical set', () => {
  // Feature: matrix-kehadiran-dark-redesign, Property 1: Status mapping bijection on the canonical set
  // Validates: Requirements 13.2

  it('round-trips every canonical token through forward+reverse with arbitrary case and whitespace padding', () => {
    const whitespaceChar = fc.constantFrom(' ', '\t', '\n', '\r', '  ', ' \t');

    fc.assert(
      fc.property(
        fc.constantFrom(...CANONICAL_TOKENS),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }),
        whitespaceChar,
        whitespaceChar,
        (token, caseMask, leftPad, rightPad) => {
          const cased = randomizeCase(token, caseMask);
          const padded = `${leftPad}${cased}${rightPad}`;

          const decoded = mapBackendStatus(padded);
          expect(decoded).not.toBeNull();
          expect(reverseToCanonical(decoded as AttendanceStatus)).toBe(
            token.toLowerCase().trim(),
          );
        },
      ),
      { numRuns: 25 },
    );
  });

  it('forward map restricted to the canonical set is injective (six distinct outputs)', () => {
    const outputs = CANONICAL_TOKENS.map((t) => mapBackendStatus(t));
    expect(outputs.every((v) => v !== null)).toBe(true);
    expect(new Set(outputs).size).toBe(CANONICAL_TOKENS.length);
    expect(CANONICAL_TOKENS.length).toBe(6);
  });
});

describe('Property 2: Status presentation registry totality', () => {
  // Feature: matrix-kehadiran-dark-redesign, Property 2: Status presentation registry totality
  // Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10, 10.2, 12.2

  /** Color membership set: tokens.accent values ∪ {OFF_COLOR}. */
  const allowedColors = new Set<string>([
    ...Object.values(tokens.accent),
    OFF_COLOR,
  ]);

  it('every AttendanceStatus has a non-empty color in the allowed palette, and a non-empty icon and label', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<AttendanceStatus>(...ATTENDANCE_STATUSES),
        (s) => {
          const color = getStatusColor(s);
          expect(typeof color).toBe('string');
          expect(color.length).toBeGreaterThan(0);
          expect(allowedColors.has(color)).toBe(true);

          const icon = getStatusIcon(s);
          expect(typeof icon).toBe('string');
          expect(icon.length).toBeGreaterThan(0);

          const label = attendanceStatusToLabel(s);
          expect(typeof label).toBe('string');
          expect(label.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('the six statuses produce six distinct colors, six distinct icons, and six distinct labels', () => {
    const colors = ATTENDANCE_STATUSES.map(getStatusColor);
    const icons = ATTENDANCE_STATUSES.map(getStatusIcon);
    const labels = ATTENDANCE_STATUSES.map(attendanceStatusToLabel);

    expect(new Set(colors).size).toBe(ATTENDANCE_STATUSES.length);
    expect(new Set(icons).size).toBe(ATTENDANCE_STATUSES.length);
    expect(new Set(labels).size).toBe(ATTENDANCE_STATUSES.length);
    expect(ATTENDANCE_STATUSES.length).toBe(6);
  });
});
