/**
 * Status mapping — single source of truth for converting between the raw
 * backend attendance tokens (`/api/monthly-grid`) and the closed
 * `AttendanceStatus` set rendered by the Matrix Page UI.
 *
 * Pure module: NO React, MUI, or DOM imports. Imports only the project
 * design tokens and shared types so the helpers below can be consumed by
 * domain code, components, and property-based tests interchangeably.
 *
 * Design reference:
 *   .kiro/specs/matrix-kehadiran-dark-redesign/design.md
 *     §"Status mapping table"
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10, 10.2, 12.2, 13.2
 */

import { tokens } from '../tokens';
import type { AttendanceStatus } from '../types';

// ─── Canonical six-token spec set ──────────────────────────────────────────

/**
 * The exactly-six canonical Indonesian tokens used by Property 1's
 * bijection check. These are the lowercase, untrimmed forms named in the
 * design's status mapping table; the broader `FORWARD` map below admits
 * additional aliases (e.g. `cuti`, `ct`, `s`, `partial_hadir`).
 */
export const CANONICAL_TOKENS = [
  'hadir',
  'alfa',
  'izin',
  'sakit',
  'terlambat',
  'libur',
] as const;

export type CanonicalToken = (typeof CANONICAL_TOKENS)[number];

// ─── Forward mapping: backend token → AttendanceStatus ─────────────────────

/**
 * Lowercase, trimmed lookup table. `mapBackendStatus` normalizes the input
 * before consulting this map, so callers SHOULD NOT key into it directly.
 *
 * Keys cover both the canonical set and the documented aliases observed in
 * the existing backend payload (`HADIR`, `ALFA`, `OFF`, `S`, `CT`,
 * `PARTIAL_HADIR`, etc., decoded case-insensitively).
 */
const FORWARD: Record<string, AttendanceStatus> = {
  hadir: 'present',
  partial_hadir: 'present',
  alfa: 'alpha',
  izin: 'leave',
  i: 'leave',
  cuti: 'leave',
  ct: 'leave',
  sakit: 'sick',
  s: 'sick',
  sd: 'sick',
  terlambat: 'late',
  late: 'late',
  libur: 'off',
  off: 'off',
};

/**
 * Decode a raw backend status string into the closed `AttendanceStatus`
 * set. Trims whitespace and lowercases before lookup. Returns `null` for
 * unrecognized, empty, or null/undefined inputs (callers render an empty
 * neutral cell per requirement 6.9).
 */
export function mapBackendStatus(
  raw: string | null | undefined,
): AttendanceStatus | null {
  if (raw == null) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return FORWARD[key] ?? null;
}

// ─── Reverse mapping: AttendanceStatus → canonical token ───────────────────

/**
 * Inverse of `FORWARD` restricted to the canonical six-token set. Used by
 * Property 1's bijection check and by any consumer that needs a stable
 * round-trip token (e.g. analytics, query-string serialization).
 */
const REVERSE_CANONICAL: Record<AttendanceStatus, CanonicalToken> = {
  present: 'hadir',
  alpha: 'alfa',
  leave: 'izin',
  sick: 'sakit',
  late: 'terlambat',
  off: 'libur',
};

/**
 * Round-trip helper: given a frontend `AttendanceStatus`, return the
 * canonical lowercase Indonesian token. Total over the 6-element domain.
 */
export function reverseToCanonical(status: AttendanceStatus): CanonicalToken {
  return REVERSE_CANONICAL[status];
}

// ─── Display labels (Indonesian) ───────────────────────────────────────────

/**
 * Indonesian display labels used by Footer_Legend, KPI_Row, tooltip text,
 * and Cell_Detail_Popover. Total over `AttendanceStatus`.
 *
 * Requirements: 10.1, 10.2.
 */
export const STATUS_LABELS_ID: Record<AttendanceStatus, string> = {
  present: 'Hadir',
  alpha: 'Alfa',
  leave: 'Izin/Cuti',
  sick: 'Sakit',
  late: 'Terlambat',
  off: 'Day Off',
};

export function attendanceStatusToLabel(status: AttendanceStatus): string {
  return STATUS_LABELS_ID[status];
}

// ─── Color registry ────────────────────────────────────────────────────────

/**
 * Gray used by the `off` (Day Off) status. The design specifies `#6B7280`
 * which is intentionally outside the `tokens.accent` palette (gray is not
 * an accent). Exported so Property 2's color-membership check can union it
 * with `Object.values(tokens.accent)`.
 *
 * Requirements: 6.7.
 */
export const OFF_COLOR = '#6B7280';

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: tokens.accent.green,
  alpha: tokens.accent.red,
  leave: tokens.accent.leaveBlue,
  sick: tokens.accent.cyan,
  late: tokens.accent.orange,
  off: OFF_COLOR,
};

/**
 * Resolve the icon color for a given status. The five non-`off` statuses
 * draw from `tokens.accent`; `off` uses the dedicated `OFF_COLOR` gray.
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10, 10.2, 12.2.
 */
export function getStatusColor(status: AttendanceStatus): string {
  return STATUS_COLORS[status];
}

// ─── Icon registry ─────────────────────────────────────────────────────────

/**
 * String identifiers for icons. The MatrixCell / Footer_Legend layer
 * resolves these to MUI icon nodes; this module stays DOM-free so it can
 * be exercised by property tests without a renderer.
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7.
 */
const STATUS_ICONS: Record<AttendanceStatus, string> = {
  present: 'check_circle',
  alpha: 'alert_circle',
  leave: 'plane',
  sick: 'shield',
  late: 'clock',
  off: 'dash',
};

export function getStatusIcon(status: AttendanceStatus): string {
  return STATUS_ICONS[status];
}
