/**
 * SidebarItem — stateless presentational navigation item rendered inside
 * `LeftSidebar`. One instance per top-level menu entry (Dashboard, Karyawan,
 * Kehadiran, Lembur, …).
 *
 * Visual states (per design.md, Section "Components and Interfaces" and the
 * Design_Tokens table):
 *
 *   • Active (`active === true`):
 *       - background:    tokens.accent.blueAlt
 *       - text + icon:   tokens.text.sidebarPrimary
 *       - border-radius: tokens.radius.sidebarItem (10 px)
 *       - subtle glow:   `0 0 0 1px ${tokens.accent.blue}40` (boxShadow)
 *
 *   • Inactive (default):
 *       - text + icon:   tokens.text.sidebarSecondary
 *       - hover bg:      rgba(255,255,255,0.04)
 *       - border-radius: tokens.radius.sidebarItem
 *
 * Expansion behavior:
 *   • `expanded === true`  → icon + label (label suppressed when empty).
 *   • `expanded === false` → icon-only, centered, wrapped in a MUI
 *     `<Tooltip placement="right" title={label}>` so the menu remains
 *     discoverable in the collapsed sidebar (Requirement 11.4).
 *
 * Accessibility:
 *   • `aria-current="page"` is emitted only when `active === true`.
 *   • `aria-expanded` reflects the current `expanded` prop.
 *
 * The component is intentionally pure — it owns no state, registers no
 * effects, and forwards interaction to the caller via `onClick`.
 *
 * Requirements: 2.4, 2.7, 11.4, 12.3, 15.1
 */

import type { ReactElement, ReactNode } from 'react';
import {
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';

import { tokens } from '../tokens';

export interface SidebarItemProps {
  /** Display label (Indonesian, e.g. "Kehadiran"). */
  label: string;
  /** Leading icon node — rendered inside `ListItemIcon`. */
  icon: ReactNode;
  /** Whether this item represents the currently active route/tab. */
  active?: boolean;
  /** Whether the parent sidebar is in expanded (label-visible) mode. */
  expanded: boolean;
  /** Click handler — invoked on user activation (mouse / keyboard). */
  onClick?: () => void;
  /** Reserved for future sub-item support. Currently not rendered. */
  children?: ReactNode;
}

export function SidebarItem(props: SidebarItemProps): ReactElement {
  const { label, icon, active = false, expanded, onClick } = props;

  // Color tokens for icon + label. Both follow the active/inactive split so
  // there is exactly one source of color truth per state.
  const foreground = active
    ? tokens.text.sidebarPrimary
    : tokens.text.sidebarSecondary;

  const button = (
    <ListItemButton
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      disableRipple={false}
      sx={{
        // Geometry — keep the item compact and uniform across states.
        minHeight: 40,
        px: expanded ? 1.5 : 1, // 12 px when expanded, 8 px when icon-only
        py: 0.75, // 6 px vertical
        // Center the icon when collapsed; left-align when expanded.
        justifyContent: expanded ? 'flex-start' : 'center',
        // Visual state (active vs inactive).
        color: foreground,
        backgroundColor: active ? tokens.accent.blueAlt : 'transparent',
        borderRadius: `${tokens.radius.sidebarItem}px`,
        boxShadow: active ? `0 0 0 1px ${tokens.accent.blue}40` : 'none',
        // Hover background only applies in the inactive state — the active
        // tile already has a saturated fill.
        '&:hover': {
          backgroundColor: active
            ? tokens.accent.blueAlt
            : 'rgba(255,255,255,0.04)',
        },
        // Smooth, subtle transition for color/background changes.
        transition:
          'background-color 120ms ease, color 120ms ease, box-shadow 120ms ease',
      }}
    >
      <ListItemIcon
        sx={{
          color: foreground,
          // Center icon in collapsed mode; otherwise leave the natural left
          // alignment that ListItemButton expects.
          minWidth: expanded ? 36 : 0,
          justifyContent: 'center',
          // Inherit color so SVG icons pick up the active/inactive token.
          '& svg': { fontSize: 20 },
        }}
      >
        {icon}
      </ListItemIcon>

      {expanded ? (
        <ListItemText
          primary={label}
          primaryTypographyProps={{
            sx: {
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: foreground,
              lineHeight: 1.25,
              // Single-line label with ellipsis to handle long names
              // gracefully at narrow sidebar widths.
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          }}
        />
      ) : null}
    </ListItemButton>
  );

  // When collapsed, the label is hidden; surface it via a right-anchored
  // tooltip so users can still identify each menu entry.
  if (!expanded) {
    return (
      <Tooltip placement="right" title={label}>
        {button}
      </Tooltip>
    );
  }

  return button;
}

export default SidebarItem;
