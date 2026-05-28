/**
 * Property-based tests for `domain/popover.ts`.
 *
 * Test stack: Vitest + fast-check.
 *
 * Property 6 — Popover viewport-clamp invariant
 *
 * Validates: Requirements 8.9
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { clampPopoverPosition } from '../domain/popover';

// ─── Shared arbitraries ────────────────────────────────────────────────────

/**
 * Sanity bounds — kept loose enough to exercise the clamp logic broadly
 * while still staying inside realistic browser geometry. The anchor is
 * deliberately allowed to fall (partially or fully) outside the viewport
 * via negative `x`/`y`, mirroring the case where a Matrix_Cell sits near
 * a scrolled edge.
 */
const anchorArb = fc.record({
  x: fc.integer({ min: -1000, max: 5000 }),
  y: fc.integer({ min: -1000, max: 5000 }),
  width: fc.integer({ min: 1, max: 200 }),
  height: fc.integer({ min: 1, max: 200 }),
});

const popoverSizeArb = fc.record({
  width: fc.integer({ min: 50, max: 600 }),
  height: fc.integer({ min: 50, max: 600 }),
});

const viewportArb = fc.record({
  width: fc.integer({ min: 800, max: 3000 }),
  height: fc.integer({ min: 600, max: 2000 }),
});

const marginArb = fc.integer({ min: 0, max: 32 });

// ─── Property 6 (non-degenerate) ───────────────────────────────────────────

describe('Property 6: Popover viewport-clamp invariant — non-degenerate', () => {
  // Feature: matrix-kehadiran-dark-redesign, Property 6: Popover viewport-clamp invariant
  // Validates: Requirements 8.9

  it('places the popover fully inside the viewport with the requested margin on both axes', () => {
    fc.assert(
      fc.property(
        fc.record({
          anchor: anchorArb,
          popoverSize: popoverSizeArb,
          viewport: viewportArb,
          margin: marginArb,
        }),
        ({ anchor, popoverSize, viewport, margin }) => {
          // Restrict to the non-degenerate input space.
          fc.pre(viewport.width >= popoverSize.width + 2 * margin);
          fc.pre(viewport.height >= popoverSize.height + 2 * margin);

          const result = clampPopoverPosition({
            anchor,
            popoverSize,
            viewport,
            margin,
          });

          expect(result.x).toBeGreaterThanOrEqual(margin);
          expect(result.x + popoverSize.width).toBeLessThanOrEqual(
            viewport.width - margin,
          );
          expect(result.y).toBeGreaterThanOrEqual(margin);
          expect(result.y + popoverSize.height).toBeLessThanOrEqual(
            viewport.height - margin,
          );

          // Placement is one of the two documented values.
          expect(['bottom', 'top']).toContain(result.placement);
        },
      ),
      { numRuns: 25 },
    );
  });
});

// ─── Property 6 (degenerate) ───────────────────────────────────────────────

describe('Property 6: Popover viewport-clamp invariant — degenerate', () => {
  // Feature: matrix-kehadiran-dark-redesign, Property 6: Popover viewport-clamp invariant
  // Validates: Requirements 8.9

  it('falls back to (margin, margin) when the popover plus margins cannot fit on either axis', () => {
    fc.assert(
      fc.property(
        fc.record({
          anchor: anchorArb,
          popoverSize: popoverSizeArb,
          viewport: viewportArb,
          margin: marginArb,
        }),
        ({ anchor, popoverSize, viewport, margin }) => {
          // Force the degenerate precondition: shrink the viewport on at
          // least one axis so the popover plus margins cannot fit.
          const degenerateViewport = {
            width: Math.max(1, popoverSize.width + 2 * margin - 1),
            height: viewport.height,
          };

          const result = clampPopoverPosition({
            anchor,
            popoverSize,
            viewport: degenerateViewport,
            margin,
          });

          expect(result.x).toBe(margin);
          expect(result.y).toBe(margin);
          expect(result.placement).toBe('bottom');
        },
      ),
      { numRuns: 25 },
    );
  });
});
