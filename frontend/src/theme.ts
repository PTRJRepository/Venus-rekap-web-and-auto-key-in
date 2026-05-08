import { createTheme, alpha } from '@mui/material/styles';

const BRAND = {
    primary: '#0F2040',      // Deep Corporate Navy
    primaryLight: '#1E355B',  // Hover state
    secondary: '#0052CC',    // Clear Action Blue
    accent: '#7C3AED',        // Violet accent (for special states)
    accentAlt: '#059669',     // Emerald (for login/brand)
    surface: {
        dark: '#0F172A',      // Slate 900 - deep professional dark
        darkMid: '#1E293B',   // Slate 800 - card backgrounds
        darkCard: '#283548',  // Elevated dark cards
        darkBorder: '#334155', // Dark borders
        darkText: '#CBD5E1',  // Light text on dark
        darkMuted: '#64748B', // Muted text on dark
    },
};

const STATUS = {
    hadir:    { bg: '#E8F5E9', text: '#1B5E20', border: '#C8E6C9', chip: '#36B37E' },
    alfa:     { bg: '#FFEBEE', text: '#B71C1C', border: '#FFCDD2', chip: '#DE350B' },
    off:      { bg: '#F4F5F5', text: '#616161', border: '#E0E0E0', chip: '#5E6C84' },
    cuti:     { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE', chip: '#0052CC' },
    sakit:    { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', chip: '#D97706' },
    overtime: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', chip: '#7C3AED' },
};

const SHADOW = {
    sm: '0 1px 2px rgba(9,30,66,0.04), 0 1px 1px rgba(9,30,66,0.02)',
    md: '0 4px 8px rgba(9,30,66,0.08), 0 1px 3px rgba(9,30,66,0.04)',
    lg: '0 10px 25px rgba(9,30,66,0.12), 0 4px 10px rgba(9,30,66,0.06)',
    xl: '0 25px 50px rgba(9,30,66,0.18), 0 10px 20px rgba(9,30,66,0.08)',
};

const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: BRAND.primary,
            light: BRAND.primaryLight,
            dark: '#061024',
            contrastText: '#FFFFFF',
        },
        secondary: {
            main: BRAND.secondary,
            light: '#337BE0',
            dark: '#003A99',
            contrastText: '#FFFFFF',
        },
        background: {
            default: '#F4F7F9',
            paper: '#FFFFFF',
        },
        text: {
            primary: '#172B4D',
            secondary: '#5E6C84',
            disabled: '#A5ADBA',
        },
        success:  { main: '#00875A', light: '#36B37E', dark: '#006644', contrastText: '#FFF' },
        warning:  { main: '#FF991F', light: '#FFAB00', dark: '#D97706', contrastText: '#172B4D' },
        error:    { main: '#DE350B', light: '#FF5630', dark: '#BF2600', contrastText: '#FFF' },
        info:     { main: '#00B8D9', light: '#00C7E6', dark: '#008DA6', contrastText: '#FFF' },
        divider: '#DFE1E6',
    },
    shape: { borderRadius: 8 },
    typography: {
        fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
        fontSize: 13,
        h1: { fontWeight: 700, color: '#172B4D', letterSpacing: '-0.02em' },
        h2: { fontWeight: 700, color: '#172B4D', letterSpacing: '-0.01em' },
        h3: { fontWeight: 600, color: '#172B4D', letterSpacing: '-0.01em' },
        h4: { fontWeight: 600, color: '#172B4D' },
        h5: { fontWeight: 600, color: '#172B4D' },
        h6: { fontWeight: 700, fontSize: '1.15rem', letterSpacing: '0.01em', color: '#172B4D' },
        subtitle1: { fontWeight: 600, fontSize: '0.95rem', color: '#172B4D' },
        subtitle2: { fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#5E6C84' },
        body1: { fontSize: '0.9rem', color: '#172B4D', lineHeight: 1.6 },
        body2: { fontSize: '0.85rem', color: '#42526E', lineHeight: 1.5 },
        caption: { fontSize: '0.75rem', fontWeight: 500, color: '#5E6C84' },
        button: { textTransform: 'none', fontWeight: 600, fontSize: '0.85rem', letterSpacing: '0.01em' },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: '#F4F7F9',
                    scrollbarColor: '#C1C7D0 #F4F7F9',
                    '&::-webkit-scrollbar, & *::-webkit-scrollbar': { width: 8, height: 8 },
                    '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': { borderRadius: 8, backgroundColor: '#C1C7D0', minHeight: 24 },
                    '&::-webkit-scrollbar-thumb:focus, & *::-webkit-scrollbar-thumb:focus': { backgroundColor: '#A5ADBA' },
                    '&::-webkit-scrollbar-thumb:active, & *::-webkit-scrollbar-thumb:active': { backgroundColor: '#A5ADBA' },
                    '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': { backgroundColor: '#A5ADBA' },
                    '&::-webkit-scrollbar-corner, & *::-webkit-scrollbar-corner': { backgroundColor: '#F4F7F9' },
                },
                '::selection': { backgroundColor: alpha(BRAND.secondary, 0.2), color: BRAND.primary },
                '*': { transition: 'color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease' },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8, padding: '7px 18px', boxShadow: 'none',
                    '&:hover': { boxShadow: SHADOW.md },
                },
                containedPrimary: {
                    backgroundColor: BRAND.primary, color: '#FFF',
                    '&:hover': { backgroundColor: BRAND.primaryLight, boxShadow: SHADOW.md },
                },
                containedSecondary: {
                    backgroundColor: BRAND.secondary, color: '#FFF',
                    '&:hover': { backgroundColor: '#0047B3', boxShadow: SHADOW.md },
                },
                outlined: {
                    borderColor: '#DFE1E6', color: '#42526E',
                    '&:hover': { borderColor: '#C1C7D0', backgroundColor: '#F4F5F7' },
                },
                sizeSmall: { padding: '4px 12px', fontSize: '0.8rem', borderRadius: 6 },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none', border: '1px solid #DFE1E6',
                    boxShadow: SHADOW.sm, borderRadius: 10,
                },
                elevation1: { boxShadow: SHADOW.sm },
                elevation2: { boxShadow: SHADOW.md },
                elevation3: { boxShadow: SHADOW.lg },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: { borderRadius: 12, boxShadow: SHADOW.sm, border: '1px solid #E8EDF3' },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: { borderBottom: '1px solid #DFE1E6', padding: '10px 16px', fontSize: '0.85rem' },
                head: {
                    backgroundColor: '#F4F5F7', color: '#5E6C84', fontWeight: 600,
                    textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em',
                    paddingTop: 12, paddingBottom: 12,
                },
                stickyHeader: { backgroundColor: '#F4F5F7' },
            },
        },
        MuiTableContainer: {
            styleOverrides: {
                root: { borderRadius: 10, border: '1px solid #DFE1E6', boxShadow: 'none' },
            },
        },
        MuiTabs: {
            styleOverrides: {
                root: { minHeight: 44, borderBottom: '1px solid #DFE1E6' },
                indicator: { height: 3, borderRadius: '3px 3px 0 0', backgroundColor: BRAND.secondary },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    fontWeight: 600, minHeight: 44, textTransform: 'none', fontSize: '0.875rem',
                    color: '#5E6C84',
                    '&:hover': { color: '#172B4D', backgroundColor: alpha(BRAND.primary, 0.04) },
                    '&.Mui-selected': { color: BRAND.secondary },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: 8, backgroundColor: '#FFFFFF',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#DFE1E6' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#A5ADBA' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.secondary, borderWidth: 2 },
                    '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(BRAND.secondary, 0.15)}` },
                },
                input: { padding: '9px 14px', fontSize: '0.875rem' },
            },
        },
        MuiSelect: { styleOverrides: { select: { padding: '9px 14px' } } },
        MuiChip: {
            styleOverrides: {
                root: { borderRadius: 6, fontWeight: 600, fontSize: '0.75rem' },
                outlined: { borderWidth: '1px' },
                sizeSmall: { height: 22, fontSize: '0.7rem', borderRadius: 4 },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    background: `linear-gradient(135deg, ${BRAND.primary} 0%, #17366b 100%)`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: { borderRadius: 14, boxShadow: SHADOW.xl },
            },
        },
        MuiDialogTitle: {
            styleOverrides: {
                root: { padding: '18px 24px', borderBottom: '1px solid #DFE1E6' },
            },
        },
        MuiDialogContent: {
            styleOverrides: {
                root: { padding: '20px 24px' },
            },
        },
        MuiDialogActions: {
            styleOverrides: {
                root: { padding: '14px 24px', borderTop: '1px solid #DFE1E6' },
            },
        },
        MuiLinearProgress: {
            styleOverrides: {
                root: { borderRadius: 4, height: 5 },
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    backgroundColor: BRAND.primary, borderRadius: 6,
                    fontSize: '0.75rem', fontWeight: 500, boxShadow: SHADOW.md,
                },
                arrow: { color: BRAND.primary },
            },
        },
        MuiAlert: {
            styleOverrides: {
                root: { borderRadius: 8 },
                standardSuccess: { backgroundColor: '#E8F5E9', color: '#1B5E20', border: '1px solid #C8E6C9' },
                standardError: { backgroundColor: '#FFEBEE', color: '#B71C1C', border: '1px solid #FFCDD2' },
                standardWarning: { backgroundColor: '#FFF8E1', color: '#B45309', border: '1px solid #FDE68A' },
                standardInfo: { backgroundColor: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' },
            },
        },
        MuiSkeleton: {
            styleOverrides: {
                root: { borderRadius: 6 },
            },
        },
        MuiSwitch: {
            styleOverrides: {
                switchBase: {
                    '&.Mui-checked': {
                        color: BRAND.secondary,
                        '& + .MuiSwitch-track': { backgroundColor: alpha(BRAND.secondary, 0.5) },
                    },
                },
                track: { borderRadius: 12 },
            },
        },
        MuiBadge: {
            styleOverrides: {
                badge: { fontWeight: 700, fontSize: '0.65rem' },
            },
        },
        MuiDivider: {
            styleOverrides: {
                root: { borderColor: '#DFE1E6' },
            },
        },
    },
});

export { BRAND, STATUS, SHADOW };
export default theme;
