import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import RefreshIcon from '@mui/icons-material/Refresh';

/**
 * Error Boundary Component
 * Catches React errors and displays a fallback UI
 * Prevents the entire app from crashing due to component errors
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <Paper
                    elevation={0}
                    sx={{
                        p: 4,
                        textAlign: 'center',
                        bgcolor: '#FEF2F2',
                        border: '1px solid #FECACA',
                        borderRadius: 2,
                        m: 2
                    }}
                >
                    <Box sx={{ mb: 2 }}>
                        <WarningIcon sx={{ fontSize: 48, color: '#DC2626' }} />
                    </Box>
                    <Typography
                        variant="h6"
                        sx={{ color: '#DC2626', fontWeight: 700, mb: 1 }}
                    >
                        Terjadi Kesalahan
                    </Typography>
                    <Typography sx={{ color: '#7F1D1D', mb: 3 }}>
                        {this.state.error?.message || 'Terjadi kesalahan yang tidak diharapkan'}
                    </Typography>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={this.handleReset}
                        startIcon={<RefreshIcon />}
                    >
                        Coba Lagi
                    </Button>
                </Paper>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
