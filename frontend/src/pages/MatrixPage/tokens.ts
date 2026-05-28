/**
 * Design tokens for the Matrix Kehadiran "Dark Matrix Command Center" page.
 *
 * This module is the SINGLE SOURCE of all hex colors, rgba values, and pixel
 * radius constants used by MatrixPage and its sub-components. No other file
 * inside `pages/MatrixPage/` (or files that consume this page) should hard-code
 * these values — always import from here.
 *
 * The module is intentionally pure: no React, MUI, or DOM imports, so it can
 * be consumed by domain logic, theme builders, and tests alike.
 *
 * `as const` is used (rather than `Object.freeze`) to keep the inferred types
 * narrow (literal types instead of `string` / `number`) and to remain
 * tree-shakable under `verbatimModuleSyntax`.
 *
 * Requirements: 1.7, 1.8, 2.4, 2.5, 2.6, 2.7, 5.5, 5.7, 5.8, 12.1, 12.2, 12.3,
 * 12.4, 12.5
 */
export const tokens = {
  bg: {
    page: '#06111F',
    surface: '#0B1A2A',
    card: '#102235',
    elevated: '#132C44',
    sidebar: '#081B2E',
  },
  border: {
    subtle: 'rgba(255,255,255,0.08)',
    cell: 'rgba(255,255,255,0.05)',
  },
  text: {
    primary: '#F1F7FF',
    secondary: '#9FB2C8',
    muted: '#6F8196',
    sidebarPrimary: '#EAF2FF',
    sidebarSecondary: '#8FA3B8',
  },
  accent: {
    blue: '#1476FF',
    blueAlt: '#136DFF',
    green: '#22C55E',
    red: '#EF4444',
    orange: '#F59E0B',
    purple: '#8B5CF6',
    cyan: '#38BDF8',
    leaveBlue: '#2F8BFF',
  },
  weekend: {
    saturdayTint: 'rgba(37,99,235,0.10)',
    sundayTint: 'rgba(239,68,68,0.12)',
    saturdayText: '#60A5FA',
    sundayText: '#F87171',
    saturdayHeaderBg: '#0B2748',
    sundayHeaderBg: '#35151A',
    saturdayHeaderBorder: '#2563EB',
    sundayHeaderBorder: '#EF4444',
  },
  today: {
    headerBg: '#123B63',
    bodyTint: 'rgba(56,189,248,0.08)',
    border: 'rgba(56,189,248,0.35)',
  },
  header: {
    borderBottom: 'rgba(255,255,255,0.16)',
  },
  heatmap: {
    workHours: {
      green: { bg: '#12351F', text: '#22C55E' },
      yellow: { bg: '#3A2F12', text: '#FACC15' },
      red: { bg: '#3B1115', text: '#F87171' },
      gray: { bg: '#1F2937', text: '#6B7280' },
    },
    shortHours: {
      green: { bg: '#12351F', text: '#22C55E' },
      yellow: { bg: '#3A2F12', text: '#FACC15' },
      orange: { bg: '#3B2411', text: '#FB923C' },
      red: { bg: '#3B1115', text: '#F87171' },
    },
    overtime: {
      none: { bg: 'transparent', text: '#6F8196' },
      green: { bg: '#12351F', text: '#22C55E' },
      blue: { bg: '#123B63', text: '#38BDF8' },
      orange: { bg: '#3A2F12', text: '#F59E0B' },
      red: { bg: '#3B1115', text: '#F87171' },
    },
  },
  summary: {
    bg: '#0B1A2A',
    border: 'rgba(255,255,255,0.14)',
  },
  radius: {
    sidebarItem: 10,
    card: 12,
    button: 10,
    cell: 6,
    popover: 14,
  },
} as const;

export type Tokens = typeof tokens;
