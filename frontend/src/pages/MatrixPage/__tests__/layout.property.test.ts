// Feature: matrix-kehadiran-dark-redesign, Property 4: Cell-width fits without horizontal scroll
// Feature: matrix-kehadiran-dark-redesign, Property 5: Responsive breakpoint state machine
// Feature: matrix-kehadiran-dark-redesign, Property 7: Layout budget invariant
//
// Test stack: Vitest + fast-check.
//
// Validates:
//   - Property 4 → Requirements 5.2, 5.4, 11.2, 11.8
//   - Property 5 → Requirements 11.1, 11.2, 11.3, 11.4
//   - Property 7 → Requirements 1.4, 1.5, 1.6

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  GUTTER,
  MIN_CELL_WIDTH_WIDE,
  MAX_CELL_WIDTH_WIDE,
  MIN_CELL_WIDTH_STANDARD,
  MAX_CELL_WIDTH_STANDARD,
  MIN_CELL_WIDTH_NARROW,
  MIN_MAIN_WORKSPACE_WIDTH,
  computeCellWidth,
  empColWidth,
  insightWidth,
  mainWorkspaceWidth,
  resolveBreakpoint,
  sidebarWidth,
  type Breakpoint,
} from '../domain/layout';

// ─── Shared helpers ────────────────────────────────────────────────────────

/**
 * Allowed cell-width range per breakpoint (matches the clamps used by
 * `computeCellWidth`). For `narrow` the upper bound is `Infinity`.
 */
function allowedRange(b: Breakpoint): { lo: number; hi: number } {
  if (b === 'wide') return { lo: MIN_CELL_WIDTH_WIDE, hi: MAX_CELL_WIDTH_WIDE };
  if (b === 'standard') {
    return { lo: MIN_CELL_WIDTH_STANDARD, hi: MAX_CELL_WIDTH_STANDARD };
  }
  return { lo: MIN_CELL_WIDTH_NARROW, hi: Number.POSITIVE_INFINITY };
}

/** Strict order for monotonicity check: narrow < standard < wide. */
function ord(b: Breakpoint): number {
  if (b === 'narrow') return 0;
  if (b === 'standard') return 1;
  return 2;
}

// ─── Property 4 ─────────────────────────────────────────────────────────────

describe('Property 4: Cell-width fits without horizontal scroll', () => {
  it('cw is in the allowed range and empColWidth + d*cw fits within mainWorkspaceWidth on wide/standard', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1336, max: 2560 }),
        fc.boolean(),
        fc.constantFrom(28, 29, 30, 31),
        (W, expanded, d) => {
          const b = resolveBreakpoint(W, d);
          // Restrict to Desktop_Wide and Desktop_Standard. Tablet_Or_Narrow
          // intentionally permits horizontal scroll (req 11.7).
          fc.pre(b === 'wide' || b === 'standard');

          const { lo, hi } = allowedRange(b);

          // Filter to FEASIBLE configurations only — i.e. those where
          // floor(availableForDays / d) >= lo, so `computeCellWidth` does
          // not need to clamp UP past the budget.
          //
          // The design (design.md §"Why this fits 31 columns on
          // Desktop_Standard") already documents that at the lower edge of
          // Desktop_Standard with an expanded sidebar there is *not* enough
          // budget to render 28+ day months at the 28 px floor. The layout
          // layer compensates by auto-collapsing the sidebar to icon-only;
          // the configuration `(W=1336, b='standard', expanded=true, d=28)`
          // is therefore not a configuration the renderer would ever
          // actually request — Property 4 only needs to hold for the
          // configurations the renderer can choose.
          //
          // This precondition encodes that contract: the budget invariant
          // is checked across all combinations the renderer may legitimately
          // produce. Configurations the renderer would auto-correct (by
          // collapsing the sidebar) are intentionally excluded.
          const availableMainWidth =
            W - 2 * GUTTER - sidebarWidth(b, expanded) - insightWidth(b);
          fc.pre(empColWidth(b) + d * lo <= availableMainWidth);

          const cw = computeCellWidth(W, b, expanded, d);

          // Cell width remains within the breakpoint's allowed range.
          expect(cw).toBeGreaterThanOrEqual(lo);
          expect(cw).toBeLessThanOrEqual(hi);

          // empColWidth + days*cellWidth must fit within the main workspace
          // width (the column slot occupied by Top_Header / Matrix_Table).
          expect(empColWidth(b) + d * cw).toBeLessThanOrEqual(
            availableMainWidth,
          );
        },
      ),
      { numRuns: 25 },
    );
  });
});

// ─── Property 5 ─────────────────────────────────────────────────────────────

describe('Property 5: Responsive breakpoint state machine', () => {
  it('totality: resolveBreakpoint always returns one of {wide, standard, narrow}', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4000 }),
        fc.constantFrom(28, 29, 30, 31),
        (W, d) => {
          const b = resolveBreakpoint(W, d);
          expect(['wide', 'standard', 'narrow']).toContain(b);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('monotonicity: W1 ≤ W2 implies ord(bp(W1)) ≤ ord(bp(W2)) under narrow < standard < wide', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 4000 }),
          fc.integer({ min: 0, max: 4000 }),
        ),
        fc.constantFrom(28, 29, 30, 31),
        ([a, b], d) => {
          const W1 = Math.min(a, b);
          const W2 = Math.max(a, b);
          const bp1 = resolveBreakpoint(W1, d);
          const bp2 = resolveBreakpoint(W2, d);
          expect(ord(bp1)).toBeLessThanOrEqual(ord(bp2));
        },
      ),
      { numRuns: 25 },
    );
  });
});

// ─── Property 7 ─────────────────────────────────────────────────────────────

describe('Property 7: Layout budget invariant', () => {
  it('sidebar + main + insight + 2*gutter equals W and main ≥ 720 on wide/standard', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1280, max: 2560 }),
        fc.constantFrom<Breakpoint>('wide', 'standard'),
        fc.boolean(),
        (W, b, expanded) => {
          // Filter unrealistic combos: 'wide' is only formally valid at
          // viewports that the breakpoint resolver would itself classify
          // as wide (W ≥ 1440). Without this, we'd test 'wide' at W=1280
          // which exceeds the budget.
          fc.pre(b !== 'wide' || W >= 1440);

          const sb = sidebarWidth(b, expanded);
          const ins = insightWidth(b);
          const main = mainWorkspaceWidth(W, b, expanded);

          // Budget identity (exact, no rounding involved — all integers).
          expect(sb + main + ins + 2 * GUTTER).toBe(W);

          // Main workspace minimum width (req 1.5).
          expect(main).toBeGreaterThanOrEqual(MIN_MAIN_WORKSPACE_WIDTH);
        },
      ),
      { numRuns: 25 },
    );
  });
});
