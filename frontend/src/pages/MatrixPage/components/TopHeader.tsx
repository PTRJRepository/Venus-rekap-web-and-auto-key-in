/**
 * TopHeader — Layer 1 compact global header (max 56px).
 *
 * Single row: title/subtitle | spacer | month selector | Hari Ini | search |
 *             sidebar-restore | notifications | help | avatar | narrow-drawer
 *
 * Mode selector and workspace toggles have moved to MatrixToolbar (Layer 2).
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
  sidebarMode?: 'expanded' | 'collapsed' | 'hidden';
  onSetSidebarMode?: (mode: 'expanded' | 'collapsed' | 'hidden') => void;
}

function getMonthOptions(): Array<{
  key: string;
  month: number;
  year: number;
  label: string;
}> {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });
  const options: Array<{ key: string; month: number; year: number; label: string }> = [];
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
    sidebarMode = 'expanded',
    onSetSidebarMode,
  } = props;

  const options = getMonthOptions();
  const currentKey = periodKey(month, year);
  const hasCurrent = options.some((o) => o.key === currentKey);
  const allOptions = hasCurrent
    ? options
    : [
        ...options,
        {
          key: currentKey,
          month,
          year,
          label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(
            new Date(year, month - 1, 1),
          ),
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
        gap: 1,
        px: 2,
        height: 56,
        minHeight: 56,
        maxHeight: 56,
        width: '100%',
        backgroundColor: tokens.bg.surface,
        borderBottom: `1px solid ${tokens.border.subtle}`,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {/* Title block */}
      <Stack direction="column" spacing={0} sx={{ minWidth: 0, flexShrink: 0 }}>
        <Typography
          variant="h6"
          component="h1"
          sx={{
            fontSize: 15,
            fontWeight: 700,
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
            fontSize: 11,
            lineHeight: 1.2,
            color: tokens.text.muted,
            whiteSpace: 'nowrap',
          }}
        >
          Matrix Kehadiran
        </Typography>
      </Stack>

      <Box sx={{ flexGrow: 1 }} />

      {/* Controls cluster */}
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
        {/* Month selector */}
        <Select
          size="small"
          value={currentKey}
          onChange={handleSelectChange}
          inputProps={{ 'aria-label': 'Pilih bulan' }}
          sx={{
            width: 130,
            fontSize: 12,
            color: tokens.text.primary,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border.subtle },
            '& .MuiSvgIcon-root': { color: tokens.text.secondary },
            '& .MuiSelect-select': { py: '5px' },
          }}
        >
          {allOptions.map((opt) => (
            <MenuItem key={opt.key} value={opt.key} sx={{ fontSize: 12 }}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>

        {/* Hari Ini */}
        <Button
          variant="outlined"
          size="small"
          onClick={onTodayClick}
          sx={{
            borderColor: tokens.border.subtle,
            color: tokens.text.primary,
            whiteSpace: 'nowrap',
            fontSize: 12,
            py: '4px',
            px: 1.25,
            minWidth: 0,
            '&:hover': {
              borderColor: tokens.accent.blueAlt,
              backgroundColor: 'rgba(255,255,255,0.04)',
            },
          }}
        >
          Hari Ini
        </Button>

        {/* Search */}
        <TextField
          size="small"
          placeholder="Cari karyawan..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          inputRef={searchInputRef}
          inputProps={{ 'aria-label': 'Cari karyawan' }}
          sx={{
            width: 200,
            '& .MuiOutlinedInput-root': {
              color: tokens.text.primary,
              fontSize: 12,
              '& fieldset': { borderColor: tokens.border.subtle },
            },
            '& input::placeholder': { color: tokens.text.muted, opacity: 1 },
            '& .MuiInputBase-input': { py: '5px' },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded sx={{ color: tokens.text.secondary, fontSize: 16 }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Box
                  component="span"
                  sx={{
                    fontSize: 10,
                    px: 0.5,
                    py: '1px',
                    border: `1px solid ${tokens.border.subtle}`,
                    borderRadius: '3px',
                    color: tokens.text.muted,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
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

        {/* Restore sidebar when hidden */}
        {sidebarMode === 'hidden' && onSetSidebarMode && (
          <Tooltip title="Tampilkan sidebar">
            <IconButton
              size="small"
              aria-label="Tampilkan sidebar"
              onClick={() => onSetSidebarMode('expanded')}
              sx={{ color: tokens.text.secondary }}
            >
              <MenuRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="Notifikasi">
          <IconButton size="small" aria-label="Notifikasi" sx={{ color: tokens.text.secondary }}>
            <NotificationsNoneRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Bantuan">
          <IconButton size="small" aria-label="Bantuan" sx={{ color: tokens.text.secondary }}>
            <HelpOutlineRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Avatar
          sx={{
            width: 28,
            height: 28,
            bgcolor: tokens.accent.blueAlt,
            color: tokens.text.sidebarPrimary,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          AD
        </Avatar>

        {showInsightDrawerToggle && (
          <Tooltip title="Tampilkan ringkasan">
            <IconButton
              size="small"
              aria-label="Tampilkan panel ringkasan"
              onClick={onToggleInsightDrawer}
              sx={{ color: tokens.text.secondary }}
            >
              <InfoRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
}

export default TopHeader;
