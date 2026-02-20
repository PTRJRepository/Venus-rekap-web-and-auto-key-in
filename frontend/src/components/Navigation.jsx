import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Dashboard, TableChart, Storage } from '@mui/icons-material';

const Navigation = () => {
    return (
        <AppBar position="static" elevation={2} sx={{ mb: 3 }}>
            <Toolbar>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
                    Venus Attendance System
                </Typography>
                <Box>
                    <Button 
                        color="inherit" 
                        component={RouterLink} 
                        to="/"
                        startIcon={<TableChart />}
                    >
                        Matrix
                    </Button>
                    <Button 
                        color="inherit" 
                        component={RouterLink} 
                        to="/staging"
                        startIcon={<Storage />}
                    >
                        Staging
                    </Button>
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default Navigation;
