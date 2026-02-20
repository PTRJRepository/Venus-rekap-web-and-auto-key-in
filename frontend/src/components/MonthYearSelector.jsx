import React, { useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    Grid,
    Button,
    ToggleButton,
    ToggleButtonGroup,
    Divider,
    CircularProgress,
    alpha
} from '@mui/material';
import {
    CalendarMonth as CalendarIcon,
    Search as SearchIcon,
    DateRange as DateRangeIcon,
    ChevronRight as ChevronRightIcon
} from '@mui/icons-material';

const getMonths = () => {
    return [
        { id: 1, name: 'Januari', short: 'Jan' },
        { id: 2, name: 'Februari', short: 'Feb' },
        { id: 3, name: 'Maret', short: 'Mar' },
        { id: 4, name: 'April', short: 'Apr' },
        { id: 5, name: 'Mei', short: 'Mei' },
        { id: 6, name: 'Juni', short: 'Jun' },
        { id: 7, name: 'Juli', short: 'Jul' },
        { id: 8, name: 'Agustus', short: 'Agt' },
        { id: 9, name: 'September', short: 'Sep' },
        { id: 10, name: 'Oktober', short: 'Okt' },
        { id: 11, name: 'November', short: 'Nov' },
        { id: 12, name: 'Desember', short: 'Des' },
    ];
};

const getYears = () => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
};

const MonthYearSelector = ({ onFetch, loading }) => {
    const [years] = useState(getYears());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(null);
    const months = getMonths();

    const handleYearChange = (event, newValue) => {
        if (newValue !== null) {
            setSelectedYear(newValue);
            setSelectedMonth(null); // Reset month to force re-selection
        }
    };

    const handleFetchClick = () => {
        if (selectedMonth && selectedYear) {
            onFetch(selectedMonth, selectedYear);
        }
    };

    const getMonthName = (id) => months.find(m => m.id === id)?.name || '';

    return (
        <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'flex-start', 
            pt: 6, 
            height: '100%' 
        }}>
            <Paper
                elevation={0}
                sx={{
                    width: '100%',
                    maxWidth: 700,
                    border: '1px solid #e2e8f0',
                    borderRadius: 2,
                    overflow: 'hidden',
                    bgcolor: '#ffffff'
                }}
            >
                {/* Header Section */}
                <Box sx={{ 
                    p: 3, 
                    borderBottom: '1px solid #f1f5f9',
                    bgcolor: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2
                }}>
                    <Box sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 1.5,
                        bgcolor: 'white',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#475569'
                    }}>
                        <DateRangeIcon />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                            Filter Periode
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                            Pilih Tahun dan Bulan untuk menampilkan data absensi
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ p: 4 }}>
                    {/* Year Selection */}
                    <Box sx={{ mb: 4 }}>
                        <Typography variant="subtitle2" sx={{ 
                            mb: 1.5, 
                            fontWeight: 600, 
                            color: '#475569', 
                            textTransform: 'uppercase', 
                            fontSize: '0.75rem', 
                            letterSpacing: '0.05em' 
                        }}>
                            Tahun Anggaran
                        </Typography>
                        <ToggleButtonGroup
                            value={selectedYear}
                            exclusive
                            onChange={handleYearChange}
                            fullWidth
                            sx={{
                                '& .MuiToggleButton-root': {
                                    py: 1,
                                    fontWeight: 600,
                                    fontSize: '0.95rem',
                                    color: '#64748b',
                                    borderColor: '#cbd5e1',
                                    '&.Mui-selected': {
                                        bgcolor: '#7c3aed',
                                        color: 'white',
                                        '&:hover': {
                                            bgcolor: '#6d28d9',
                                        }
                                    },
                                    '&:hover': {
                                        bgcolor: '#f1f5f9'
                                    }
                                }
                            }}
                        >
                            {years.map(year => (
                                <ToggleButton key={year} value={year}>
                                    {year}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </Box>

                    {/* Month Selection Grid */}
                    <Box sx={{ mb: 4 }}>
                        <Typography variant="subtitle2" sx={{ 
                            mb: 1.5, 
                            fontWeight: 600, 
                            color: '#475569', 
                            textTransform: 'uppercase', 
                            fontSize: '0.75rem', 
                            letterSpacing: '0.05em' 
                        }}>
                            Bulan
                        </Typography>
                        <Grid container spacing={1.5}>
                            {months.map((m) => {
                                const isSelected = selectedMonth === m.id;
                                return (
                                    <Grid item xs={3} key={m.id}>
                                        <Button
                                            variant={isSelected ? "contained" : "outlined"}
                                            onClick={() => setSelectedMonth(m.id)}
                                            fullWidth
                                            sx={{
                                                height: 48,
                                                borderColor: isSelected ? 'primary.main' : '#e2e8f0',
                                                bgcolor: isSelected ? '#7c3aed' : 'transparent',
                                                color: isSelected ? 'white' : '#334155',
                                                fontWeight: isSelected ? 700 : 500,
                                                textTransform: 'none',
                                                fontSize: '0.9rem',
                                                '&:hover': {
                                                    bgcolor: isSelected ? '#6d28d9' : '#f8fafc',
                                                    borderColor: isSelected ? '#6d28d9' : '#cbd5e1',
                                                },
                                                boxShadow: isSelected ? '0 4px 6px -1px rgba(124, 58, 237, 0.2)' : 'none'
                                            }}
                                        >
                                            {m.name}
                                        </Button>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    </Box>

                    {/* Action Button */}
                    <Divider sx={{ my: 3 }} />
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 500 }}>
                                TERPILIH
                            </Typography>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                                {selectedMonth ? getMonthName(selectedMonth) : '-'} {selectedYear}
                            </Typography>
                        </Box>

                        <Button
                            variant="contained"
                            size="large"
                            onClick={handleFetchClick}
                            disabled={!selectedMonth || loading}
                            endIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ChevronRightIcon />}
                            sx={{
                                px: 4,
                                py: 1.2,
                                bgcolor: '#0f172a', // Dark slate for enterprise feel
                                color: 'white',
                                fontWeight: 700,
                                textTransform: 'none',
                                borderRadius: 1.5,
                                '&:hover': {
                                    bgcolor: '#1e293b'
                                },
                                '&:disabled': {
                                    bgcolor: '#cbd5e1',
                                    color: '#94a3b8'
                                }
                            }}
                        >
                            {loading ? 'Memproses Data...' : 'Tampilkan Data'}
                        </Button>
                    </Box>
                </Box>
            </Paper>
        </Box>
    );
};

export default MonthYearSelector;
