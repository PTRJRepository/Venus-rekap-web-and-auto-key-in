import React from 'react';
import {
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Avatar,
    Box,
    Menu,
    MenuItem,
    Chip,
    Tooltip,
    Badge
} from '@mui/material';
import {
    Menu as MenuIcon,
    Notifications as NotificationsIcon,
    Settings as SettingsIcon,
    HelpOutline as HelpIcon,
    AccountCircle as AccountCircleIcon
} from '@mui/icons-material';

const TopNavbar = () => {
    return (
        <AppBar
            position="static"
            elevation={0}
            sx={{
                bgcolor: '#17191c',
                borderBottom: '1px solid #2d3139',
                zIndex: 1300
            }}
        >
            <Toolbar variant="dense" sx={{ minHeight: 46, px: 2 }}>
                {/* Left: Logo & App Name */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '6px',
                        bgcolor: '#7c3aed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '1rem' }}>V</Typography>
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#e5e7eb' }}>
                        VenusHR
                    </Typography>
                    <Chip
                        label="Enterprise"
                        size="small"
                        sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            bgcolor: 'rgba(124, 58, 237, 0.15)',
                            color: '#a78bfa',
                            fontWeight: 600,
                            border: '1px solid rgba(124, 58, 237, 0.3)'
                        }}
                    />
                </Box>

                <Box sx={{ flexGrow: 1 }} />

                {/* Right: Actions */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tooltip title="Help Center">
                        <IconButton size="small" sx={{ color: '#9ca3af' }}>
                            <HelpIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Notifications">
                        <IconButton size="small" sx={{ color: '#9ca3af' }}>
                            <Badge badgeContent={3} color="error">
                                <NotificationsIcon fontSize="small" />
                            </Badge>
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Settings">
                        <IconButton size="small" sx={{ color: '#9ca3af' }}>
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Box sx={{ width: 1, height: 24, bgcolor: '#374151', mx: 1 }} />

                    <Tooltip title="Admin User">
                        <Avatar sx={{ width: 28, height: 28, bgcolor: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>
                            A
                        </Avatar>
                    </Tooltip>
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default TopNavbar;
