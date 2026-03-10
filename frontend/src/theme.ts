import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#0F2040', // Deep Corporate Navy
            light: '#28416E',
            dark: '#061024',
            contrastText: '#FFFFFF',
        },
        secondary: {
            main: '#0052CC', // Clear Action Blue
            light: '#337BE0',
            dark: '#003A99',
            contrastText: '#FFFFFF',
        },
        background: {
            default: '#F4F7F9', // Crisp cool grey background
            paper: '#FFFFFF',
        },
        text: {
            primary: '#172B4D', // Deep charcoal for readability
            secondary: '#5E6C84', // Professional subtle grey
            disabled: '#A5ADBA',
        },
        success: { main: '#00875A', light: '#36B37E', dark: '#006644', contrastText: '#FFF' },
        warning: { main: '#FF991F', light: '#FFAB00', dark: '#D97706', contrastText: '#172B4D' },
        error: { main: '#DE350B', light: '#FF5630', dark: '#BF2600', contrastText: '#FFF' },
        info: { main: '#00B8D9', light: '#00C7E6', dark: '#008DA6', contrastText: '#FFF' },
        divider: '#DFE1E6',
    },
    shape: {
        borderRadius: 6, // Crisp, modern, slightly rounded
    },
    typography: {
        fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
        fontSize: 13,
        h1: { fontWeight: 700, color: '#172B4D', letterSpacing: '-0.02em' },
        h2: { fontWeight: 700, color: '#172B4D', letterSpacing: '-0.01em' },
        h3: { fontWeight: 600, color: '#172B4D', letterSpacing: '-0.01em' },
        h4: { fontWeight: 600, color: '#172B4D' },
        h5: { fontWeight: 600, color: '#172B4D' },
        h6: {
            fontWeight: 700,
            fontSize: '1.15rem',
            letterSpacing: '0.01em',
            color: '#172B4D',
        },
        subtitle1: {
            fontWeight: 600,
            fontSize: '0.95rem',
            color: '#172B4D',
        },
        subtitle2: {
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#5E6C84',
        },
        body1: { fontSize: '0.9rem', color: '#172B4D', lineHeight: 1.5 },
        body2: {
            fontSize: '0.85rem',
            color: '#42526E',
            lineHeight: 1.5,
        },
        caption: {
            fontSize: '0.75rem',
            fontWeight: 500,
            color: '#5E6C84',
        },
        button: {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.85rem',
            letterSpacing: '0.01em',
        },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: '#F4F7F9',
                    scrollbarColor: '#C1C7D0 #F4F7F9',
                    '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
                        width: '8px',
                        height: '8px',
                    },
                    '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
                        borderRadius: 8,
                        backgroundColor: '#C1C7D0',
                        minHeight: 24,
                    },
                    '&::-webkit-scrollbar-thumb:focus, & *::-webkit-scrollbar-thumb:focus': {
                        backgroundColor: '#A5ADBA',
                    },
                    '&::-webkit-scrollbar-thumb:active, & *::-webkit-scrollbar-thumb:active': {
                        backgroundColor: '#A5ADBA',
                    },
                    '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
                        backgroundColor: '#A5ADBA',
                    },
                    '&::-webkit-scrollbar-corner, & *::-webkit-scrollbar-corner': {
                        backgroundColor: '#F4F7F9',
                    },
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    boxShadow: 'none',
                    borderRadius: 6,
                    padding: '6px 16px',
                    '&:hover': {
                        boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                    },
                },
                containedPrimary: {
                    backgroundColor: '#0F2040',
                    color: '#FFFFFF',
                    '&:hover': {
                        backgroundColor: '#1E355B',
                    },
                },
                containedSecondary: {
                    backgroundColor: '#0052CC',
                    color: '#FFFFFF',
                    '&:hover': {
                        backgroundColor: '#0047B3',
                    },
                },
                outlined: {
                    borderColor: '#DFE1E6',
                    color: '#42526E',
                    backgroundColor: 'transparent',
                    '&:hover': {
                        borderColor: '#C1C7D0',
                        backgroundColor: '#F4F5F7',
                    },
                }
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    border: '1px solid #DFE1E6',
                    boxShadow: '0 1px 3px rgba(9,30,66,0.05), 0 1px 2px rgba(9,30,66,0.03)', // Subtle, clean shadow
                    borderRadius: 8,
                },
                elevation1: {
                    boxShadow: '0 1px 3px rgba(9,30,66,0.05), 0 1px 2px rgba(9,30,66,0.03)',
                },
                elevation2: {
                    boxShadow: '0 4px 8px rgba(9,30,66,0.06), 0 0 1px rgba(9,30,66,0.1)',
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    borderBottom: '1px solid #DFE1E6',
                    padding: '10px 16px',
                    fontSize: '0.85rem',
                },
                head: {
                    backgroundColor: '#F4F5F7',
                    color: '#5E6C84',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    letterSpacing: '0.04em',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                },
                stickyHeader: {
                    backgroundColor: '#F4F5F7',
                },
            },
        },
        MuiTableContainer: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    border: '1px solid #DFE1E6',
                    boxShadow: 'none',
                }
            }
        },
        MuiTabs: {
            styleOverrides: {
                root: {
                    minHeight: 44,
                    borderBottom: '1px solid #DFE1E6',
                },
                indicator: {
                    height: 3,
                    borderTopLeftRadius: 3,
                    borderTopRightRadius: 3,
                    backgroundColor: '#0052CC',
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    fontWeight: 600,
                    minHeight: 44,
                    textTransform: 'none',
                    fontSize: '0.85rem',
                    color: '#5E6C84',
                    '&:hover': {
                        color: '#172B4D',
                        backgroundColor: 'rgba(9, 30, 66, 0.04)',
                    },
                    '&.Mui-selected': {
                        color: '#0052CC',
                    },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: 6,
                    backgroundColor: '#FFFFFF',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#DFE1E6',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#A5ADBA',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#0052CC',
                        borderWidth: '2px',
                    },
                    '&.Mui-focused': {
                        boxShadow: '0 0 0 3px rgba(0, 82, 204, 0.15)',
                    }
                },
                input: {
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                }
            }
        },
        MuiSelect: {
            styleOverrides: {
                select: {
                    padding: '8px 12px',
                }
            }
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 4,
                    fontWeight: 600,
                    fontSize: '0.75rem',
                },
                outlined: {
                    borderWidth: '1px',
                }
            }
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: '#0F2040',
                    backgroundImage: 'linear-gradient(90deg, #0F2040 0%, #17366b 100%)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }
            }
        }
    },
});

export default theme;