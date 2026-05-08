import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';
import HourglassIcon from '@mui/icons-material/HourglassEmpty';
import ErrorIcon from '@mui/icons-material/ErrorOutline';

export const SkeletonTable = ({ rows = 8, cols = 6 }) => (
    <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', gap: 1, p: 1.5, bgcolor: '#F4F5F7', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #DFE1E6' }}>
            {Array.from({ length: cols }).map((_, i) => (
                <Box key={i} sx={{
                    flex: 1, height: 10, bgcolor: '#E0E4EA', borderRadius: 4,
                    animation: 'pulse 1.5s ease-in-out infinite',
                    '@keyframes pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.5 },
                    },
                }} />
            ))}
        </Box>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, r) => (
            <Box key={r} sx={{ display: 'flex', gap: 1, p: 1.5, borderBottom: '1px solid #F0F0F0' }}>
                {Array.from({ length: cols }).map((_, c) => (
                    <Box key={c} sx={{
                        flex: 1, height: 10, bgcolor: '#F0F3F7', borderRadius: 4,
                        animation: 'pulse 1.5s ease-in-out infinite',
                        animationDelay: `${(r * 50 + c * 20)}ms`,
                        '@keyframes pulse': {
                            '0%, 100%': { opacity: 1 },
                            '50%': { opacity: 0.5 },
                        },
                    }} />
                ))}
            </Box>
        ))}
    </Box>
);

export const EmptyState = ({ icon, title, description, action }) => (
    <Paper elevation={0} sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        py: 8, px: 4, textAlign: 'center', border: '2px dashed #DFE1E6', borderRadius: 3,
        bgcolor: '#FAFBFC',
    }}>
        <Box sx={{ color: '#C1C7D0', mb: 2 }}>
            {icon || <InboxIcon sx={{ fontSize: 56 }} />}
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#5E6C84', mb: 0.5 }}>
            {title || 'No Data Available'}
        </Typography>
        {description && (
            <Typography variant="body2" sx={{ color: '#A5ADBA', mb: action ? 2 : 0, maxWidth: 360 }}>
                {description}
            </Typography>
        )}
        {action}
    </Paper>
);

export const LoadingOverlay = ({ message = 'Memuat data...' }) => (
    <Box sx={{
        position: 'absolute', inset: 0, bgcolor: alpha('#fff', 0.7),
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 10, backdropFilter: 'blur(2px)',
    }}>
        <HourglassIcon sx={{ fontSize: 40, color: '#0052CC', mb: 1, animation: 'spin 1.5s linear infinite', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />
        <Typography sx={{ color: '#5E6C84', fontWeight: 600, fontSize: '0.875rem' }}>{message}</Typography>
    </Box>
);

export default { SkeletonTable, EmptyState, LoadingOverlay };
