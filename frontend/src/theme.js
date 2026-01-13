import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        primary: {
            main: '#1976d2',
        },
        secondary: {
            main: '#dc004e',
        },
        success: {
            main: '#28a745',
        },
        warning: {
            main: '#ffc107',
        },
        error: {
            main: '#dc3545',
        },
        info: {
            main: '#007bff',
        },
    },
    typography: {
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
        h4: {
            fontWeight: 600,
        },
        h6: {
            fontWeight: 500,
        },
    },
    components: {
        MuiTableCell: {
            styleOverrides: {
                root: {
                    padding: '8px',
                },
                head: {
                    fontWeight: 600,
                    backgroundColor: '#f5f5f5',
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    fontSize: '0.75rem',
                    height: '20px',
                },
            },
        },
    },
});

export default theme;
