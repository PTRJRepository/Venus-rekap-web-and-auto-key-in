/**
 * Layout math for the Matrix Kehadiran page.
 *
 * Pure module: NO React, MUI, or DOM imports. All functions are
 * deterministic and side-effect-free so they can be exercised by
 * property-based tests without a renderer or window.
 *
 * Design reference:
 *   .kiro/specs/matrix-kehadiran-dark-redesign/design.md
 *     §"All 31 days visible without horizontal scroll" (width budget)
 *     §"Responsive breakpoints" (resolveBreakpoint)
 *
 * Requirements: 1.4, 1.5, 1.6, 5.2, 5.4, 11.1, 11.2, 11.3, 11.4, 11.7, 11.8.
 */

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Padding from the viewport edge to the outermost panel (Left_Sidebar
 * left edge and Right_Insight_Panel right edge). Mid-point of the
 * 12–16 px range from requirement 1.6.
 */
export const GUTTER = 14;

/**
 * Total horizontal padding inside Main_Workspace (left + right). Used to
 * split `mainWorkspaceWidth` into `empColWidth + days*cellWidth + padding`.
 */
export const MAIN_PADDING = 32;

/** Cell-width clamp on Desktop_Wide (req 5.4). */
export const MIN_CELL_WIDTH_WIDE = 32;
export const MAX_CELL_WIDTH_WIDE = 38;

/** Cell-width clamp on Desktop_Standard (req 11.2). */
export const MIN_CELL_WIDTH_STANDARD = 28;
export const MAX_CELL_WIDTH_STANDARD = 34;

/**
 * Lower bound on Tablet_Or_Narrow. No upper clamp — horizontal scroll is
 * allowed (req 11.7) so cells may render larger than the 28 px floor.
 */
export const MIN_CELL_WIDTH_NARROW = 28;

/**
 * Lower bound on Main_Workspace width on Desktop_Wide/Desktop_Standard
 * so Matrix_Table remains readable (req 1.5). Used by Property 7.
 */
export const MIN_MAIN_WORKSPACE_WIDTH = 720;

// ─── Breakpoint type ───────────────────────────────────────────────────────

/**
 * Layout breakpoint state. Order (when needed for property tests):
 *   narrow < standard < wide.
 */
export type Breakpoint = 'wide' | 'standard' | 'narrow';

// ─── Per-breakpoint widths ─────────────────────────────────────────────────

/**
 * Left_Sidebar width in pixels.
 *
 * - `wide` expanded → 230 (req 1.2 mid-point).
 * - `wide` collapsed → 56 (icon-only mode, req 2.9).
 * - `standard` expanded → 220.
 * - `standard` collapsed → 56.
 * - `narrow` → always 56 (req 11.4 mandates icon-only on Tablet_Or_Narrow,
 *   regardless of `expanded`).
 *
 * Design reference: §"All 31 days visible without horizontal scroll".
 * Requirements: 1.2, 2.9, 11.4.
 */
export function sidebarWidth(b: Breakpoint, expanded: boolean | 'expanded' | 'collapsed' | 'hidden'): number {
  const mode: 'expanded' | 'collapsed' | 'hidden' =
    typeof expanded === 'string' ? expanded : (expanded ? 'expanded' : 'collapsed');
  if (mode === 'hidden') return 0;
  if (b === 'narrow') return 56;
  if (b === 'wide') return mode === 'expanded' ? 230 : 56;
  return mode === 'expanded' ? 220 : 56;
}

/**
 * Right_Insight_Panel width in pixels.
 *
 * - `wide` → 280 (req 1.3 mid-point of 260–300).
 * - `standard` → 240 (req 11.2, compressed band 220–260).
 * - `narrow` → 0 (panel collapses to a drawer overlay per req 11.5; it
 *   does not occupy column budget).
 *
 * Design reference: §"All 31 days visible without horizontal scroll".
 * Requirements: 1.3, 11.2, 11.5.
 */
export function insightWidth(b: Breakpoint): number {
  if (b === 'wide') return 280;
  if (b === 'standard') return 240;
  return 0;
}

/**
 * Employee_Column width in pixels.
 *
 * - `wide` → 220.
 * - `standard` → 200.
 * - `narrow` → 180 (still legible for avatar + name + ID).
 *
 * Design reference: §"All 31 days visible without horizontal scroll"
 * width-budget table.
 * Requirements: 5.11.
 */
export function empColWidth(b: Breakpoint): number {
  if (b === 'wide') return 220;
  if (b === 'standard') return 200;
  return 180;
}

// ─── Derived widths ────────────────────────────────────────────────────────

/**
 * Pixels available to render the date columns (the `repeat(--days, --cell)`
 * portion of the CSS grid).
 *
 *   availableForDays(W, b, e)
 *     = W − 2·GUTTER − sidebarWidth(b,e) − insightWidth(b) − MAIN_PADDING
 *       − empColWidth(b)
 *
 * Clamped to 0 minimum so callers never divide by negative budget when
 * the viewport is unrealistically small.
 *
 * Design reference: §"All 31 days visible without horizontal scroll"
 * (width budget formula).
 * Requirements: 5.2, 5.4, 11.1, 11.2.
 */
export function availableForDays(
  W: number,
  b: Breakpoint,
  expanded: boolean,
): number {
  const raw =
    W -
    2 * GUTTER -
    sidebarWidth(b, expanded) -
    insightWidth(b) -
    MAIN_PADDING -
    empColWidth(b);
  return Math.max(0, raw);
}

/**
 * Width of the Main_Workspace column (Top_Header + KPI_Row + Matrix_Table
 * + Footer_Legend share this width).
 *
 *   mainWorkspaceWidth(W, b, e)
 *     = W − 2·GUTTER − sidebarWidth(b,e) − insightWidth(b)
 *
 * Clamped to 0 minimum. The total budget invariant
 *   sidebar + mainWorkspace + insight + 2·gutter == W
 * holds exactly when the raw computation is non-negative.
 *
 * Requirements: 1.4, 1.5.
 */
export function mainWorkspaceWidth(
  W: number,
  b: Breakpoint,
  expanded: boolean,
): number {
  const raw = W - 2 * GUTTER - sidebarWidth(b, expanded) - insightWidth(b);
  return Math.max(0, raw);
}

// ─── Cell width ────────────────────────────────────────────────────────────

/**
 * Compute the per-cell width for the date columns.
 *
 *   raw = floor(availableForDays / daysInMonth)
 *   wide     → clamp(raw, 32, 38)
 *   standard → clamp(raw, 28, 34)
 *   narrow   → max(raw, 28)   (no upper clamp; horizontal scroll permitted
 *                              on Tablet_Or_Narrow per req 11.7)
 *
 * Design reference: §"All 31 days visible without horizontal scroll"
 * (Constraint clamps table).
 * Requirements: 5.2, 5.4, 11.2, 11.7, 11.8.
 */
export function computeCellWidth(
  W: number,
  b: Breakpoint,
  expanded: boolean,
  daysInMonth: number,
): number {
  const raw = Math.floor(availableForDays(W, b, expanded) / daysInMonth);
  if (b === 'wide') {
    return Math.min(
      MAX_CELL_WIDTH_WIDE,
      Math.max(MIN_CELL_WIDTH_WIDE, raw),
    );
  }
  if (b === 'standard') {
    return Math.min(
      MAX_CELL_WIDTH_STANDARD,
      Math.max(MIN_CELL_WIDTH_STANDARD, raw),
    );
  }
  // narrow: floor only — no upper bound; renderer adds horizontal scroll.
  return Math.max(MIN_CELL_WIDTH_NARROW, raw);
}

// ─── Breakpoint resolution ─────────────────────────────────────────────────

/**
 * Resolve the layout breakpoint from viewport width and the visible
 * month's day count.
 *
 * Thresholds (in order):
 *   - viewportWidth ≥ 1440 → `'wide'`
 *   - viewportWidth ≥ 1336 → `'standard'` (always; the 1336 boundary
 *     guarantees 31-day months fit on Desktop_Standard with icon-only
 *     sidebar — see design §"Why this fits 31 columns on Desktop_Standard")
 *   - viewportWidth ≥ 1280 AND daysInMonth ≤ 30 → `'standard'`
 *     (February and 30-day months fit at the lower 1280 boundary even
 *     with the expanded sidebar)
 *   - otherwise → `'narrow'`
 *
 * Design reference: §"Responsive breakpoints" → `resolveBreakpoint`.
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.7, 11.8.
 */
export function resolveBreakpoint(
  viewportWidth: number,
  daysInMonth: number,
): Breakpoint {
  if (viewportWidth >= 1440) return 'wide';
  if (viewportWidth >= 1336) return 'standard';
  if (viewportWidth >= 1280 && daysInMonth <= 30) return 'standard';
  return 'narrow';
}
