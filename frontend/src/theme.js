import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#0f172a', // Slate 900 (Professional Dark Navy)
            light: '#334155',
            dark: '#020617',
            contrastText: '#ffffff',
        },
        secondary: {
            main: '#6366f1', // Indigo 500 (Modern Accent)
            light: '#818cf8',
            dark: '#4f46e5',
            contrastText: '#ffffff',
        },
        background: {
            default: '#f8fafc', // Slate 50 (Very light grey background)
            paper: '#ffffff',
        },
        text: {
            primary: '#1e293b', // Slate 800 (High contrast)
            secondary: '#64748b', // Slate 500 (Subtle)
            disabled: '#94a3b8',
        },
        success: { main: '#10b981', light: '#d1fae5', contrastText: '#064e3b' }, // Emerald
        warning: { main: '#f59e0b', light: '#fef3c7', contrastText: '#78350f' }, // Amber
        error: { main: '#ef4444', light: '#fee2e2', contrastText: '#7f1d1d' }, // Red
        info: { main: '#3b82f6', light: '#dbeafe', contrastText: '#1e3a8a' }, // Blue
        
        divider: '#e2e8f0', // Slate 200
    },
    shape: {
        borderRadius: 6, // Tighter corners for enterprise look (Odoo style)
    },
    typography: {
        fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
        fontSize: 13, // Slightly smaller for data density
        h6: {
            fontWeight: 700,
            fontSize: '1.1rem',
            letterSpacing: '-0.01em',
            color: '#0f172a',
        },
        subtitle1: {
            fontWeight: 600,
            fontSize: '0.9rem',
        },
        subtitle2: {
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
        },
        body2: {
            fontSize: '0.85rem',
            lineHeight: 1.5,
        },
        caption: {
            fontSize: '0.75rem',
            fontWeight: 500,
        },
        button: {
            textTransform: 'none',
            fontWeight: 600,
            letterSpacing: '0.01em',
        },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    scrollbarColor: "#cbd5e1 #f1f5f9",
                    "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
                        width: "8px",
                        height: "8px",
                    },
                    "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
                        borderRadius: 8,
                        backgroundColor: "#cbd5e1",
                        minHeight: 24,
                    },
                    "&::-webkit-scrollbar-thumb:focus, & *::-webkit-scrollbar-thumb:focus": {
                        backgroundColor: "#94a3b8",
                    },
                    "&::-webkit-scrollbar-thumb:active, & *::-webkit-scrollbar-thumb:active": {
                        backgroundColor: "#94a3b8",
                    },
                    "&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover": {
                        backgroundColor: "#94a3b8",
                    },
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    boxShadow: 'none',
                    border: '1px solid transparent',
                    '&:hover': {
                        boxShadow: 'none',
                    },
                },
                containedPrimary: {
                    backgroundColor: '#0f172a',
                    '&:hover': {
                        backgroundColor: '#1e293b',
                    },
                },
                outlined: {
                    borderColor: '#cbd5e1',
                    color: '#475569',
                    '&:hover': {
                        borderColor: '#94a3b8',
                        backgroundColor: '#f1f5f9',
                    },
                }
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    border: '1px solid #e2e8f0', // Subtle border
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    borderBottom: '1px solid #e2e8f0',
                    padding: '8px 12px', // Compact padding
                },
                head: {
                    backgroundColor: '#f8fafc',
                    color: '#475569',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontSize: '0.75rem',
                    letterSpacing: '0.05em',
                },
                stickyHeader: {
                    backgroundColor: '#f8fafc',
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    fontWeight: 600,
                    minHeight: 48,
                },
            },
        },
    },
});

export default theme;