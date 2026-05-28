/**
 * Popover positioning — pure function for placing the Cell Detail Popover
 * relative to a clicked Matrix Cell anchor while keeping the popover fully
 * inside the viewport.
 *
 * Pure module: NO React, MUI, or DOM imports. Inputs are plain pass-by-value
 * shapes (`Rect`, `width/height`, scalars), so the helper can be exercised
 * by property-based tests without a DOM. Component callers are responsible
 * for converting an `Element` into a `Rect` (e.g. via
 * `element.getBoundingClientRect()`).
 *
 * Strategy (matches the design's Cell_Detail_Popover positioning section
 * and Property 6):
 *   1. Default placement is `'bottom'`: the popover is centered horizontally
 *      under the anchor with a 4 px gap.
 *   2. If the bottom-placed popover would overflow the lower viewport edge
 *      (accounting for `margin`), placement flips to `'top'` and the popover
 *      is positioned 4 px above the anchor.
 *   3. After choosing `y`, the `x` candidate is clamped into
 *      `[margin, max(margin, viewport.width - popoverSize.width - margin)]`.
 *   4. `y` is clamped similarly into the analogous vertical range.
 *   5. Degenerate case — when the popover plus margins cannot fit within the
 *      viewport on either axis (`popoverSize.width + 2*margin > viewport.width`
 *      OR `popoverSize.height + 2*margin > viewport.height`) — the function
 *      returns `(margin, margin)` with `'bottom'` placement and the caller is
 *      expected to allow scrolling within the popover.
 *
 * Output guarantee in the non-degenerate case:
 *   margin ≤ x ≤ viewport.width  - popoverSize.width  - margin
 *   margin ≤ y ≤ viewport.height - popoverSize.height - margin
 *
 * Design reference:
 *   .kiro/specs/matrix-kehadiran-dark-redesign/design.md
 *     §"Viewport-aware positioning — clampPopoverPosition"
 *     §"Property 6: Popover viewport-clamp invariant"
 *
 * Requirements: 8.9
 */

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * Axis-aligned rectangle in viewport coordinates. Mirrors the subset of
 * `DOMRect` that the placement algorithm needs, but kept DOM-free so the
 * function can be unit/property-tested without a renderer.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Inputs to `clampPopoverPosition`. All values are in CSS pixels and refer
 * to the same coordinate system (the visual viewport).
 *
 * - `anchor`         — rect of the clicked Matrix_Cell.
 * - `popoverSize`    — measured (or estimated) popover content box.
 * - `viewport`       — visible viewport size (typically `window.innerWidth /
 *                      innerHeight` at the call site).
 * - `margin`         — minimum distance kept between the popover and any
 *                      viewport edge.
 */
export interface ClampInput {
  anchor: Rect;
  popoverSize: { width: number; height: number };
  viewport: { width: number; height: number };
  margin: number;
}

/**
 * Result of `clampPopoverPosition`. `(x, y)` is the top-left corner of the
 * popover; `placement` describes where the popover ended up relative to the
 * anchor — `'bottom'` is the default, `'top'` is used only when the bottom
 * placement would overflow the viewport.
 */
export interface ClampResult {
  x: number;
  y: number;
  placement: 'bottom' | 'top';
}

// ─── Implementation ────────────────────────────────────────────────────────

/** Vertical gap between the anchor and the popover edge, in CSS px. */
const POPOVER_GAP = 4;

/**
 * Compute a viewport-clamped popover position relative to an anchor rect.
 *
 * See the module header for the full strategy and output guarantee.
 *
 * Requirements: 8.9.
 */
export function clampPopoverPosition(input: ClampInput): ClampResult {
  const { anchor, popoverSize, viewport, margin } = input;

  // Step 5 (degenerate): popover + margins doesn't fit in viewport on either
  // axis. Caller is expected to allow scrolling within the popover.
  const fitsHorizontally = popoverSize.width + 2 * margin <= viewport.width;
  const fitsVertically = popoverSize.height + 2 * margin <= viewport.height;
  if (!fitsHorizontally || !fitsVertically) {
    return { x: margin, y: margin, placement: 'bottom' };
  }

  // Step 1: default placement is below the anchor, centered horizontally.
  let placement: 'bottom' | 'top' = 'bottom';
  const candidateX = anchor.x + anchor.width / 2 - popoverSize.width / 2;
  let candidateY = anchor.y + anchor.height + POPOVER_GAP;

  // Step 2: flip to top if the bottom placement overflows the viewport.
  if (candidateY + popoverSize.height + margin > viewport.height) {
    placement = 'top';
    candidateY = anchor.y - popoverSize.height - POPOVER_GAP;
  }

  // Steps 3 & 4: clamp x and y into their valid ranges. The upper bound uses
  // `max(margin, …)` defensively so the interval is never inverted; in the
  // non-degenerate branch (guarded above) `viewport.width  - popoverSize.width
  // - margin >= margin`, so the `max` is a no-op but reads symmetrically.
  const xMaxRaw = viewport.width - popoverSize.width - margin;
  const yMaxRaw = viewport.height - popoverSize.height - margin;
  const xMax = Math.max(margin, xMaxRaw);
  const yMax = Math.max(margin, yMaxRaw);

  const x = Math.min(xMax, Math.max(margin, candidateX));
  const y = Math.min(yMax, Math.max(margin, candidateY));

  return { x, y, placement };
}
