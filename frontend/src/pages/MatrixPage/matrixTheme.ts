/**
 * Material-UI theme overlay for the Matrix Kehadiran "Dark Matrix Command
 * Center" page. Built from a fresh dark theme via `createTheme`, with every
 * color, radius, and divider sourced from the Design_Tokens module — no
 * hard-coded hex values live in this file.
 *
 * The theme is applied locally (a `<ThemeProvider theme={matrixTheme}>` wraps
 * only `MatrixPage`), so other tabs in the app keep their existing light
 * theme (Requirement 14.4).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */
import { createTheme } from '@mui/material/styles';

import { tokens } from './tokens';

export const matrixTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: tokens.bg.page,
      paper: tokens.bg.surface,
    },
    primary: { main: tokens.accent.blue },
    success: { main: tokens.accent.green },
    error: { main: tokens.accent.red },
    warning: { main: tokens.accent.orange },
    info: { main: tokens.accent.cyan },
    text: {
      primary: tokens.text.primary,
      secondary: tokens.text.secondary,
      disabled: tokens.text.muted,
    },
    divider: tokens.border.subtle,
  },
  shape: {
    // Matches tokens.radius.card (12).
    borderRadius: tokens.radius.card,
  },
  typography: {
    fontFamily: '"Inter","Geist","Manrope","SF Pro",system-ui,sans-serif',
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: tokens.bg.surface,
          borderColor: tokens.border.subtle,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          // Matches tokens.radius.button (10); textTransform 'none' aligns
          // with modern UX conventions (no SHOUTY uppercase labels).
          borderRadius: tokens.radius.button,
          textTransform: 'none',
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: tokens.radius.popover,
          backgroundColor: tokens.bg.elevated,
          border: `1px solid ${tokens.border.subtle}`,
        },
      },
    },
  },
});

export default matrixTheme;
