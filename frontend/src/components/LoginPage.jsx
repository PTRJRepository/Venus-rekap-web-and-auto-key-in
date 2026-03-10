import React, { useState } from 'react';
import { Box, Paper, TextField, Button, Typography, IconButton, InputAdornment, Container, Fade, CircularProgress, Alert } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import FactoryIcon from '@mui/icons-material/Factory';

const LoginPage = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // Simple validation based on user request
        setTimeout(() => {
            if (username === 'admin' && password === 'rebin@mill') {
                onLogin(true);
            } else {
                setError('Username atau password salah. Silakan coba lagi.');
                setLoading(false);
            }
        }, 1000);
    };

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #064e3b 100%)',
        }}>
            {/* Background Decorative Elements (Palm Oil Vibes) */}
            <Box sx={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.05)', filter: 'blur(80px)' }} />
            <Box sx={{ position: 'absolute', bottom: -150, left: -100, width: 500, height: 500, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.05)', filter: 'blur(100px)' }} />

            <Container maxWidth="xs" sx={{ zIndex: 1 }}>
                <Fade in={true} timeout={1000}>
                    <Paper elevation={24} sx={{ 
                        p: 4, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center',
                        borderRadius: 4,
                        bgcolor: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        {/* Logo Section */}
                        <Box sx={{ 
                            width: 70, height: 70, 
                            bgcolor: '#064e3b', 
                            borderRadius: '20px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            mb: 2,
                            boxShadow: '0 10px 20px rgba(6, 78, 59, 0.3)',
                            transform: 'rotate(-5deg)'
                        }}>
                            <FactoryIcon sx={{ color: 'white', fontSize: 35 }} />
                        </Box>

                        <Typography variant="h4" component="h1" sx={{ fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', mb: 0.5 }}>
                            VENUS <span style={{ color: '#059669' }}>MILL</span>
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600, mb: 4, textAlign: 'center' }}>
                            PT. REBINMAS JAYA - MANAGEMENT SYSTEM
                        </Typography>

                        {error && (
                            <Alert severity="error" sx={{ width: '100%', mb: 3, borderRadius: 2 }}>
                                {error}
                            </Alert>
                        )}

                        <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                label="Username Admin"
                                autoFocus
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                InputProps={{
                                    sx: { borderRadius: 2 }
                                }}
                            />
                            <TextField
                                margin="normal"
                                required
                                fullWidth
                                label="Password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                InputProps={{
                                    sx: { borderRadius: 2 },
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                                                {showPassword ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />

                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                disabled={loading}
                                sx={{ 
                                    mt: 4, mb: 2, py: 1.5, 
                                    borderRadius: 2,
                                    bgcolor: '#064e3b',
                                    fontWeight: 800,
                                    fontSize: '1rem',
                                    textTransform: 'none',
                                    boxShadow: '0 4px 12px rgba(6, 78, 59, 0.4)',
                                    '&:hover': { bgcolor: '#065f46', boxShadow: '0 6px 15px rgba(6, 78, 59, 0.5)' }
                                }}
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : 'MASUK KE SYSTEM'}
                            </Button>

                            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                <AgricultureIcon sx={{ color: '#059669', fontSize: 18 }} />
                                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700 }}>
                                    POWERED BY REBINMAS TECHNOLOGY
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Fade>
                
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', mt: 4, display: 'block', textAlign: 'center' }}>
                    © 2026 PT. Rebinmas Jaya. All Rights Reserved.
                </Typography>
            </Container>
        </Box>
    );
};

export default LoginPage;
