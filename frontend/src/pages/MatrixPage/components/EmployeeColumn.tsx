/**
 * Stateless left-column cell for a single employee row in the Matrix table.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ [Avatar 28×28]  Name (body2, primary, ellipsis)        [⋮] │
 *   │                 EmployeeID · Department (caption, muted)    │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Sticky-left behavior is the responsibility of the parent `MatrixTable`
 * (it sets `position: sticky; left: 0`). This component only renders the
 * cell content and reacts to hover / menu interactions.
 *
 * The component is memoized — props are simple primitives plus stable
 * callbacks, so referential equality on `employee` keeps re-renders limited
 * to rows whose hover state actually changed.
 *
 * Requirements: 5.11
 */

import { memo } from 'react';
import type { MouseEvent, ReactElement } from 'react';
import {
  Avatar,
  Box,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';

import { tokens } from '../tokens';
import type { Employee } from '../types';

export interface EmployeeColumnProps {
  /** Employee whose row this cell belongs to. */
  employee: Employee;
  /** Computed pixel width (e.g. 200, 220, 230). Drives container `width`. */
  width: number;
  /** Matches the matrix row height in pixels. */
  height: number;
  /** When `true`, render the row-hover background. Lifted by `MatrixTable`. */
  isHovered?: boolean;
  /** Mouse-enter notifier for parent hover lifting. */
  onMouseEnter?: () => void;
  /** Mouse-leave notifier for parent hover lifting. */
  onMouseLeave?: () => void;
  /** Invoked when the trailing 3-dot menu button is clicked. */
  onMenuClick?: (employeeId: string, anchorEl: HTMLElement) => void;
}

/**
 * Derive 1–2 character initials from `name`.
 *
 * - Empty / whitespace-only input → `'?'` (always renders something).
 * - Single token → first 2 chars uppercased (e.g. "Budi" → "BU").
 * - Multi-token → first letter of first + first letter of last token
 *   (e.g. "Budi Santoso Jaya" → "BJ").
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function EmployeeColumnComponent(props: EmployeeColumnProps): ReactElement {
  const {
    employee,
    width,
    height,
    isHovered = false,
    onMouseEnter,
    onMouseLeave,
    onMenuClick,
  } = props;

  const subtitle = `${employee.employeeId} · ${employee.department || '-'}`;
  const initials = getInitials(employee.name);

  const handleMenuClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (onMenuClick) {
      onMenuClick(employee.employeeId, event.currentTarget);
    }
  };

  return (
    <Box
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      sx={{
        width,
        height,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1, // 8px
        px: 1, // 8px horizontal padding
        boxSizing: 'border-box',
        backgroundColor: isHovered
          ? 'rgba(255,255,255,0.04)'
          : 'transparent',
        transition: 'background-color 80ms ease',
      }}
    >
      <Avatar
        src={employee.avatarUrl ?? undefined}
        alt={employee.name}
        sx={{
          width: 28,
          height: 28,
          fontSize: 12,
          fontWeight: 600,
          color: tokens.text.primary,
          backgroundColor: `${tokens.accent.blue}33`, // ~20% opacity
          flexShrink: 0,
        }}
      >
        {initials}
      </Avatar>

      <Stack
        direction="column"
        spacing={0.25}
        sx={{
          flex: 1,
          minWidth: 0, // critical so children can ellipsis
          overflow: 'hidden',
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: tokens.text.primary,
            fontWeight: 500,
            fontSize: 13,
            lineHeight: 1.25,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={employee.name}
        >
          {employee.name}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: tokens.text.secondary,
            fontSize: 11,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={subtitle}
        >
          {subtitle}
        </Typography>
      </Stack>

      <IconButton
        size="small"
        onClick={handleMenuClick}
        aria-label={`Menu untuk ${employee.name}`}
        sx={{
          color: tokens.text.secondary,
          flexShrink: 0,
          '&:hover': {
            color: tokens.text.primary,
            backgroundColor: 'rgba(255,255,255,0.06)',
          },
        }}
      >
        <MoreVertRounded fontSize="small" />
      </IconButton>
    </Box>
  );
}

/**
 * Memoized export. Re-renders only when prop identity changes, which the
 * parent `MatrixTable` already guards via stable callback references and
 * a per-row `isHovered` boolean.
 */
export const EmployeeColumn = memo(EmployeeColumnComponent);
EmployeeColumn.displayName = 'EmployeeColumn';

export default EmployeeColumn;
