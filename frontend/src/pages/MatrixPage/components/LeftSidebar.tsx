/**
 * LeftSidebar — container component for the left navigation column of
 * Matrix_Page. Wraps the brand label, a scrollable list of `SidebarItem`s,
 * and a collapse toggle at the bottom.
 *
 * Layout (top → bottom):
 *
 *   1. Brand section (sticky-top)
 *      - Expanded:  "VENUS HR" (typography h6, fontWeight 700, color
 *        tokens.text.sidebarPrimary, padding 16 px).
 *      - Collapsed: single capital "V" rendered with the same typography
 *        token, centered horizontally, so the brand area still occupies a
 *        consistent 16 px-padded slot in icon-only mode.
 *
 *   2. Navigation list (flex-grow, scrollable on overflow)
 *      - `<List disablePadding sx={{ p: 1 }}>` with one `<SidebarItem>` per
 *        menu entry. Order is fixed per Requirement 2.2 (Dashboard,
 *        Karyawan, Kehadiran, Lembur, Izin & Cuti, Sakit, Terlambat,
 *        Laporan, Payroll, Pengaturan, Bantuan).
 *      - Each item maps to a `tabKey`. "Kehadiran" → `'matrix'` (the active
 *        tab for this page); the remaining tabKeys are listed in the
 *        `MENU_ITEMS` table below.
 *      - `active` is `(item.tabKey === activeTab)`.
 *      - `onClick` fires `onNavigate(tabKey)` so the parent (App.jsx) can
 *        switch tabs. Even tabs that App.jsx does not currently handle still
 *        emit the navigation event — App.jsx remains free to ignore unknown
 *        keys without breaking this component.
 *
 *   3. Collapse section (sticky-bottom)
 *      - `<IconButton>` rendering `ChevronLeftRounded` when expanded and
 *        `ChevronRightRounded` when collapsed. Click invokes
 *        `onToggleCollapse` so the parent owns the expanded state.
 *
 * Container-level styling:
 *   - Full height, width 100 % (the parent `MatrixPage` controls the actual
 *     pixel width via its CSS grid columns).
 *   - Background `tokens.bg.sidebar`, border-right
 *     `1px solid rgba(255,255,255,0.06)` per Requirement 2.6.
 *   - `display: flex; flexDirection: column` so the brand stays pinned at
 *     the top, the menu list grows to fill, and the collapse button stays
 *     pinned at the bottom.
 *
 * The component is purely presentational: it owns no internal state, no
 * effects, and no data fetches. Active tab and expanded state are driven
 * entirely by props.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.8, 2.9, 2.10, 11.4
 */

import type { ReactElement, ReactNode } from 'react';
import { Box, IconButton, List, Tooltip, Typography } from '@mui/material';

import DashboardRounded from '@mui/icons-material/DashboardRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import BeachAccessRounded from '@mui/icons-material/BeachAccessRounded';
import MedicalServicesRounded from '@mui/icons-material/MedicalServicesRounded';
import AlarmRounded from '@mui/icons-material/AlarmRounded';
import AssessmentRounded from '@mui/icons-material/AssessmentRounded';
import PaidRounded from '@mui/icons-material/PaidRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';

import { tokens } from '../tokens';
import { SidebarItem } from './SidebarItem';

// ─── Menu definition ───────────────────────────────────────────────────────

interface MenuEntry {
  /** Indonesian display label (Requirement 2.2). */
  label: string;
  /** Tab key forwarded to `onNavigate` and matched against `activeTab`. */
  tabKey: string;
  /** Leading icon node — already instantiated to keep the table declarative. */
  icon: ReactNode;
}

/**
 * Fixed-order menu. The order MUST mirror Requirement 2.2 exactly; reorder
 * only when the requirement itself changes.
 */
const MENU_ITEMS: ReadonlyArray<MenuEntry> = [
  { label: 'Dashboard', tabKey: 'dashboard', icon: <DashboardRounded /> },
  { label: 'Karyawan', tabKey: 'employees', icon: <PeopleRounded /> },
  { label: 'Kehadiran', tabKey: 'matrix', icon: <CalendarMonthRounded /> },
  { label: 'Lembur', tabKey: 'overtime', icon: <AccessTimeRounded /> },
  { label: 'Izin & Cuti', tabKey: 'leave', icon: <BeachAccessRounded /> },
  { label: 'Sakit', tabKey: 'sick', icon: <MedicalServicesRounded /> },
  { label: 'Terlambat', tabKey: 'late', icon: <AlarmRounded /> },
  { label: 'Laporan', tabKey: 'report', icon: <AssessmentRounded /> },
  { label: 'Payroll', tabKey: 'payroll', icon: <PaidRounded /> },
  { label: 'Pengaturan', tabKey: 'settings', icon: <SettingsRounded /> },
  { label: 'Bantuan', tabKey: 'help', icon: <HelpOutlineRounded /> },
];

// ─── Props ─────────────────────────────────────────────────────────────────

export interface LeftSidebarProps {
  /** Whether the sidebar is in expanded (label-visible) mode. */
  expanded: boolean;
  /** Currently active tab key (e.g. `'matrix'` while on Matrix_Page). */
  activeTab: string;
  /** Invoked with the clicked item's `tabKey` for parent-driven navigation. */
  onNavigate: (tabKey: string) => void;
  /** Invoked when the bottom collapse toggle is clicked. */
  onToggleCollapse: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function LeftSidebar(props: LeftSidebarProps): ReactElement {
  const { expanded, activeTab, onNavigate, onToggleCollapse } = props;

  const collapseLabel = expanded ? 'Ciutkan sidebar' : 'Perluas sidebar';

  return (
    <Box
      component="nav"
      aria-label="Navigasi utama"
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: tokens.bg.sidebar,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        // Prevent the sidebar from leaking content out of its grid track when
        // labels temporarily exceed the available width during a transition.
        overflow: 'hidden',
      }}
    >
      {/* ── Brand ─────────────────────────────────────────────────────── */}
      <Box
        sx={{
          // Padding matches the design (16 px). When collapsed we still want
          // a 16 px vertical rhythm but a slimmer horizontal padding so the
          // single "V" stays optically centered in the icon column.
          px: expanded ? 2 : 1,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'flex-start' : 'center',
          // Keep the brand stripe visually separated from the menu list.
          borderBottom: `1px solid ${tokens.border.subtle}`,
        }}
      >
        <Typography
          variant="h6"
          component="div"
          sx={{
            fontWeight: 700,
            color: tokens.text.sidebarPrimary,
            letterSpacing: 0.5,
            // Single-line brand; truncate if the parent shrinks below the
            // expanded budget mid-transition.
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {expanded ? 'VENUS HR' : 'V'}
        </Typography>
      </Box>

      {/* ── Navigation list ───────────────────────────────────────────── */}
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0, // allow inner List to scroll without expanding parent
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <List disablePadding sx={{ p: 1 }}>
          {MENU_ITEMS.map((item) => (
            <SidebarItem
              key={item.tabKey}
              label={item.label}
              icon={item.icon}
              active={item.tabKey === activeTab}
              expanded={expanded}
              onClick={() => onNavigate(item.tabKey)}
            />
          ))}
        </List>
      </Box>

      {/* ── Collapse toggle ───────────────────────────────────────────── */}
      <Box
        sx={{
          p: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'flex-end' : 'center',
          borderTop: `1px solid ${tokens.border.subtle}`,
        }}
      >
        <Tooltip title={collapseLabel} placement="right">
          <IconButton
            aria-label={collapseLabel}
            onClick={onToggleCollapse}
            size="small"
            sx={{
              color: tokens.text.sidebarSecondary,
              borderRadius: `${tokens.radius.sidebarItem}px`,
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.04)',
                color: tokens.text.sidebarPrimary,
              },
              transition: 'background-color 120ms ease, color 120ms ease',
            }}
          >
            {expanded ? <ChevronLeftRounded /> : <ChevronRightRounded />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default LeftSidebar;
