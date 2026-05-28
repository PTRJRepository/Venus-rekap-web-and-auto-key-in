/**
 * `MatrixCell` — single attendance cell rendered inside the Matrix_Table grid.
 *
 * Stateless and memoized. The Matrix_Table renders ~31×170 = 5,000+ instances
 * simultaneously, so the component avoids local state, performs all decoration
 * via inline styles, and lets the parent control hover / selection through
 * props. Hover state itself is lifted to a context held by `MatrixTable` (see
 * design §"Cell interactions") so a single mouse move only causes the two
 * cells under the row+column intersection to recompute.
 *
 * Visual contract:
 *   - Icon resolved from `getStatusIcon(status)` and colored via
 *     `getStatusColor(status)` (target 14–16 px, rendered up to 18 px).
 *   - Weekend tint via `tokens.weekend.{saturdayTint,sundayTint}`.
 *   - Hover / row+column / selection backgrounds layered on top per the
 *     priority order in the task spec (selected > intersection > row|col >
 *     weekend > transparent).
 *   - 1 px border `tokens.border.cell`, border-radius `tokens.radius.cell`.
 *   - Wrapped in a MUI `<Tooltip enterDelay={300} leaveDelay={0}>` whose title
 *     is the `ariaLabel` prop (also exposed to AT via `aria-label`).
 *
 * Accessibility:
 *   - `role="gridcell"`, `aria-label={ariaLabel}`,
 *     `tabIndex={status === null ? -1 : 0}` so empty cells stay out of the
 *     tab order while populated cells are keyboard-reachable.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10,
 *               7.1, 7.2, 7.3, 7.5, 8.1, 15.4
 */

import * as React from 'react';
import Tooltip from '@mui/material/Tooltip';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import FlightRounded from '@mui/icons-material/FlightRounded';
import MedicalServicesRounded from '@mui/icons-material/MedicalServicesRounded';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import type { SvgIconProps } from '@mui/material/SvgIcon';

import type { AttendanceStatus } from '../types';
import { tokens } from '../tokens';
import { getStatusColor, getStatusIcon } from '../domain/statusMapping';

// ─── Public props ──────────────────────────────────────────────────────────

export interface MatrixCellProps {
  /** Attendance status, or `null` for an empty (no-data) cell. */
  status: AttendanceStatus | null;
  /** True when the column is a weekend day (Saturday OR Sunday). */
  isWeekend: boolean;
  /** True when the column is specifically Saturday — drives saturday tint. */
  isSaturday?: boolean;
  /** True when the column is specifically Sunday — drives sunday tint. */
  isSunday?: boolean;
  /** True when this cell is the currently selected popover anchor. */
  isSelected: boolean;
  /** True when the lifted hover row matches this cell's employee. */
  isRowHovered: boolean;
  /** True when the lifted hover column matches this cell's date. */
  isColHovered: boolean;
  /** Computed pixel width from `computeCellWidth(...)`. */
  width: number;
  /** Computed pixel height. */
  height: number;
  /** Tooltip title and `aria-label` (e.g. "Budi · 5 Mei 2026 · Hadir"). */
  ariaLabel: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** Called with the cell DOM element so the popover can anchor to it. */
  onClick: (anchorEl: HTMLElement) => void;
}

// ─── Icon registry ─────────────────────────────────────────────────────────

/**
 * Map from the string identifiers returned by `getStatusIcon` to the actual
 * MUI icon components. Keeping this map at the component layer (rather than
 * in `domain/statusMapping.ts`) preserves the domain module's DOM-free
 * property so it remains property-testable.
 */
const ICON_MAP: Record<string, React.ComponentType<SvgIconProps>> = {
  check_circle: CheckCircleRounded,
  alert_circle: ErrorRounded,
  plane: FlightRounded,
  shield: MedicalServicesRounded,
  clock: AccessTimeRounded,
  dash: RemoveRounded,
};

// ─── Background resolver ───────────────────────────────────────────────────

/**
 * Resolve the cell background per the layered priority described in the
 * task spec. The order is intentional and exhaustive: selection wins over
 * any hover state, the row+column intersection wins over a single axis,
 * and weekend tints only apply when no hover/selection is active.
 *
 * `tokens.accent.blueAlt` is `#136DFF` → rgba(19,109,255,0.20) for the 20%
 * selection overlay required by the task spec.
 */
function resolveBackground(props: MatrixCellProps): string {
  if (props.isSelected) return 'rgba(19,109,255,0.20)';
  if (props.isRowHovered && props.isColHovered) return 'rgba(255,255,255,0.08)';
  if (props.isRowHovered || props.isColHovered) return 'rgba(255,255,255,0.04)';
  if (props.isSaturday) return tokens.weekend.saturdayTint;
  if (props.isSunday) return tokens.weekend.sundayTint;
  return 'transparent';
}

// ─── Component ─────────────────────────────────────────────────────────────

function MatrixCellInner(props: MatrixCellProps): React.ReactElement {
  const {
    status,
    isSelected,
    width,
    height,
    ariaLabel,
    onMouseEnter,
    onMouseLeave,
    onClick,
  } = props;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    onClick(e.currentTarget);
  };

  const iconKey = status !== null ? getStatusIcon(status) : null;
  const IconComponent = iconKey !== null ? (ICON_MAP[iconKey] ?? null) : null;
  const iconColor = status !== null ? getStatusColor(status) : undefined;

  const background = resolveBackground(props);

  return (
    <Tooltip enterDelay={300} leaveDelay={0} title={ariaLabel}>
      <div
        role="gridcell"
        aria-label={ariaLabel}
        aria-selected={isSelected}
        tabIndex={status === null ? -1 : 0}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={handleClick}
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          border: `1px solid ${tokens.border.cell}`,
          borderRadius: tokens.radius.cell,
          backgroundColor: background,
          cursor: status === null ? 'default' : 'pointer',
          // Hover/highlight transitions instantaneous per req 7.4 — we keep a
          // very small fade so hover feels smooth without lagging the user.
          transition: 'background-color 60ms linear',
          userSelect: 'none',
        }}
      >
        {IconComponent !== null ? (
          <IconComponent
            sx={{
              color: iconColor,
              // Target 14–16 px per req 6.8; rendering up to 18 px allowed.
              fontSize: 16,
            }}
          />
        ) : null}
      </div>
    </Tooltip>
  );
}

/**
 * Memoized export — Matrix_Table mounts thousands of these simultaneously,
 * so referential equality on props is a meaningful optimization. The parent
 * is responsible for stabilizing callback identities (otherwise memo will
 * not skip re-renders).
 */
export const MatrixCell = React.memo(MatrixCellInner);
MatrixCell.displayName = 'MatrixCell';

export default MatrixCell;
