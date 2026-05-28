/**
 * TopHeader — container for the Matrix_Page top bar.
 *
 * Layout (per design.md "Components and Interfaces" + tasks.md 8.2):
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ Kehadiran                              [Month ▾] [Hari Ini]        │
 *   │ Matrix Kehadiran                       [🔍 Cari karyawan… ⌘K]      │
 *   │                                        [🔔] [❔] [Avatar] [ℹ︎?]    │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 *   • Left:    title "Kehadiran" + subtitle "Matrix Kehadiran" stacked.
 *   • Spacer:  Box flex-grow:1 between title block and controls.
 *   • Right:   month <Select>, "Hari Ini" <Button>, search <TextField>,
 *              notification / help <IconButton>s, user <Avatar>, and
 *              (only on `narrow` breakpoint) an info <IconButton> that
 *              toggles the right-insight drawer.
 *
 * Cosmetic and palette decisions are sourced exclusively from `tokens.ts`
 * — no other hex literals appear in this file.
 *
 * Stateless / controlled: every editable surface is driven by props
 * (`month`, `year`, `searchValue`) with paired `on*Change` callbacks. The
 * search `<input>` element can be focused programmatically by the parent
 * via the forwarded `searchInputRef` (used by the Ctrl/Cmd+K shortcut
 * registered in `MatrixPage`).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.11, 11.5
 */

import type { ReactElement, Ref } from 'react';
import {
  Avatar,
  Box,
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import ViewSidebarRounded from '@mui/icons-material/ViewSidebarRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';

import { tokens } from '../tokens';

export interface TopHeaderProps {
  month: number;
  year: number;
  searchValue: string;
  onMonthChange: (newMonth: number) => void;
  onYearChange: (newYear: number) => void;
  onTodayClick: () => void;
  onSearchChange: (newValue: string) => void;
  onToggleInsightDrawer?: () => void;
  showInsightDrawerToggle?: boolean;
  searchInputRef?: Ref<HTMLInputElement>;
  onToggleKpi?: () => void;
  kpiVisible?: boolean;
  onToggleRightPanel?: () => void;
  rightPanelVisible?: boolean;
  onFocusMode?: () => void;
  isFocusMode?: boolean;
  sidebarMode?: 'expanded' | 'collapsed' | 'hidden';
  onSetSidebarMode?: (mode: 'expanded' | 'collapsed' | 'hidden') => void;
}

/**
 * Build the dropdown option list for the month picker. The window spans
 * 12 months in the past through 6 months in the future relative to the
 * current local date, generated client-side so the list always tracks
 * the user's clock without a server round-trip.
 *
 * Each option carries a stable `key` (`YYYY-MM`) used as the `<Select>`
 * value, plus the human label localized to `id-ID` (e.g. "Mei 2026").
 */
function getMonthOptions(): Array<{
  key: string;
  month: number;
  year: number;
  label: string;
}> {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  });
  const options: Array<{
    key: string;
    month: number;
    year: number;
    label: string;
  }> = [];
  for (let offset = -12; offset <= 6; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    options.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      month: m,
      year: y,
      label: fmt.format(d),
    });
  }
  return options;
}

/** Compose the `${year}-${MM}` key for a (month, year) pair. */
function periodKey(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function TopHeader(props: TopHeaderProps): ReactElement {
  const {
    month,
    year,
    searchValue,
    onMonthChange,
    onYearChange,
    onTodayClick,
    onSearchChange,
    onToggleInsightDrawer,
    showInsightDrawerToggle = false,
    searchInputRef,
    onToggleKpi,
    kpiVisible = true,
    onToggleRightPanel,
    rightPanelVisible = true,
    onFocusMode,
    isFocusMode = false,
    sidebarMode = 'expanded',
    onSetSidebarMode,
  } = props;

  // Recomputed each render — cheap (≤19 entries) and guarantees the list
  // re-anchors if the user keeps the page open across a month boundary.
  const options = getMonthOptions();
  const currentKey = periodKey(month, year);

  // If the controlled (month, year) lies outside the rolling window we
  // still want the <Select> to have a matching value, so synthesize an
  // out-of-window option on the fly. The locale formatter is identical
  // to `getMonthOptions`'s.
  const hasCurrent = options.some((o) => o.key === currentKey);
  const allOptions = hasCurrent
    ? options
    : [
        ...options,
        {
          key: currentKey,
          month,
          year,
          label: new Intl.DateTimeFormat('id-ID', {
            month: 'long',
            year: 'numeric',
          }).format(new Date(year, month - 1, 1)),
        },
      ];

  const handleSelectChange = (event: SelectChangeEvent<string>): void => {
    const next = event.target.value;
    const found = allOptions.find((o) => o.key === next);
    if (!found) return;
    if (found.month !== month) onMonthChange(found.month);
    if (found.year !== year) onYearChange(found.year);
  };

  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1.5, // 12 px
        width: '100%',
        px: 2, // 16 px
        py: 1.5, // 12 px
        backgroundColor: tokens.bg.surface,
        borderBottom: `1px solid ${tokens.border.subtle}`,
      }}
    >
      {/* Left — title block (vertical stack). */}
      <Stack direction="column" spacing={0} sx={{ minWidth: 0 }}>
        <Typography
          variant="h5"
          component="h1"
          sx={{
            fontSize: 21,
            fontWeight: 600,
            lineHeight: 1.2,
            color: tokens.text.primary,
            whiteSpace: 'nowrap',
          }}
        >
          Kehadiran
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontSize: 13,
            lineHeight: 1.3,
            color: tokens.text.secondary,
            whiteSpace: 'nowrap',
          }}
        >
          Matrix Kehadiran
        </Typography>
      </Stack>

      {/* Spacer — pushes the controls cluster to the right. */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Right — controls cluster. */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ flexShrink: 0 }}
      >
        {/* Month / year dropdown. */}
        <Select
          size="small"
          value={currentKey}
          onChange={handleSelectChange}
          inputProps={{ 'aria-label': 'Pilih bulan' }}
          sx={{
            width: 140,
            color: tokens.text.primary,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.border.subtle,
            },
            '& .MuiSvgIcon-root': { color: tokens.text.secondary },
          }}
        >
          {allOptions.map((opt) => (
            <MenuItem key={opt.key} value={opt.key}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>

        {/* "Hari Ini" — resets the period to the user's local current month. */}
        <Button
          variant="outlined"
          size="small"
          onClick={onTodayClick}
          sx={{
            borderColor: tokens.border.subtle,
            color: tokens.text.primary,
            whiteSpace: 'nowrap',
            '&:hover': {
              borderColor: tokens.accent.blueAlt,
              backgroundColor: 'rgba(255,255,255,0.04)',
            },
          }}
        >
          Hari Ini
        </Button>

        {/* Search — focused via Ctrl/Cmd+K (handler lives in MatrixPage). */}
        <TextField
          size="small"
          placeholder="Cari karyawan..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          inputRef={searchInputRef}
          inputProps={{ 'aria-label': 'Cari karyawan' }}
          sx={{
            width: 220,
            '& .MuiOutlinedInput-root': {
              color: tokens.text.primary,
              '& fieldset': { borderColor: tokens.border.subtle },
            },
            '& input::placeholder': {
              color: tokens.text.muted,
              opacity: 1,
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded
                  sx={{ color: tokens.text.secondary, fontSize: 18 }}
                />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Box
                  component="span"
                  sx={{
                    fontSize: 11,
                    lineHeight: 1,
                    px: 0.5, // 4 px horizontal
                    py: '2px',
                    border: `1px solid ${tokens.border.subtle}`,
                    borderRadius: '4px',
                    color: tokens.text.muted,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, monospace',
                    userSelect: 'none',
                  }}
                  aria-hidden="true"
                >
                  ⌘K
                </Box>
              </InputAdornment>
            ),
          }}
        />

        {/* Sidebar toggle — show menu icon when sidebar is hidden. */}
        {sidebarMode === 'hidden' && onSetSidebarMode && (
          <Tooltip title="Tampilkan sidebar">
            <IconButton
              size="small"
              aria-label="Tampilkan sidebar"
              onClick={() => onSetSidebarMode('expanded')}
              sx={{ color: tokens.text.secondary }}
            >
              <MenuRounded sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* KPI toggle */}
        {onToggleKpi && (
          <Tooltip title={kpiVisible ? 'Sembunyikan KPI' : 'Tampilkan KPI'}>
            <IconButton
              size="small"
              aria-label={kpiVisible ? 'Sembunyikan KPI' : 'Tampilkan KPI'}
              onClick={onToggleKpi}
              sx={{ color: kpiVisible ? tokens.text.secondary : tokens.accent.blue }}
            >
              {kpiVisible ? <VisibilityRounded sx={{ fontSize: 18 }} /> : <VisibilityOffRounded sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        )}

        {/* Right panel toggle */}
        {onToggleRightPanel && (
          <Tooltip title={rightPanelVisible ? 'Sembunyikan panel' : 'Tampilkan panel'}>
            <IconButton
              size="small"
              aria-label={rightPanelVisible ? 'Sembunyikan panel analisis' : 'Tampilkan panel analisis'}
              onClick={onToggleRightPanel}
              sx={{ color: rightPanelVisible ? tokens.text.secondary : tokens.accent.blue }}
            >
              <ViewSidebarRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* Focus mode toggle */}
        {onFocusMode && (
          <Tooltip title={isFocusMode ? 'Keluar Fokus' : 'Fokus Matrix'}>
            <IconButton
              size="small"
              aria-label={isFocusMode ? 'Keluar mode fokus' : 'Masuk mode fokus'}
              onClick={onFocusMode}
              sx={{
                color: isFocusMode ? tokens.accent.cyan : tokens.text.secondary,
                backgroundColor: isFocusMode ? 'rgba(56,189,248,0.12)' : 'transparent',
              }}
            >
              {isFocusMode ? <FullscreenExitRounded sx={{ fontSize: 20 }} /> : <FullscreenRounded sx={{ fontSize: 20 }} />}
            </IconButton>
          </Tooltip>
        )}

        {/* Notification — placeholder, no handler wired yet. */}
        <Tooltip title="Notifikasi">
          <IconButton
            size="small"
            aria-label="Notifikasi"
            sx={{ color: tokens.text.secondary }}
          >
            <NotificationsNoneRounded sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>

        {/* Help — placeholder. */}
        <Tooltip title="Bantuan">
          <IconButton
            size="small"
            aria-label="Bantuan"
            sx={{ color: tokens.text.secondary }}
          >
            <HelpOutlineRounded sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>

        {/* User profile avatar — generic "AD" initials for now. */}
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: tokens.accent.blueAlt,
            color: tokens.text.sidebarPrimary,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          AD
        </Avatar>

        {/* Narrow-only: drawer toggle for the right-insight panel. */}
        {showInsightDrawerToggle ? (
          <Tooltip title="Tampilkan ringkasan">
            <IconButton
              size="small"
              aria-label="Tampilkan panel ringkasan"
              onClick={onToggleInsightDrawer}
              sx={{ color: tokens.text.secondary }}
            >
              <InfoRounded sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
    </Box>
  );
}

export default TopHeader;
