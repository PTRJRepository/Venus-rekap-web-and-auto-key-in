import React, { useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    CardActionArea,
    Chip,
    Paper,
    Tabs,
    Tab,
    Fade,
} from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';

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
        setSelectedYear(newValue);
        setSelectedMonth(null); // Reset selected month when year changes
    };

    const handleMonthSelect = (monthId) => {
        setSelectedMonth({ month: monthId, year: selectedYear });
        onFetch(monthId, selectedYear);
    };

    return (
        <Box sx={{ mb: 3, maxWidth: 1600, mx: 'auto' }}>
            {/* Hero Header */}
            <Paper
                elevation={3}
                sx={{
                    p: 3,
                    mb: 3,
                    borderRadius: 3,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white'
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                            Pilih Periode Rekap Absensi
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.9 }}>
                            Klik bulan untuk menampilkan data rekap absensi karyawan
                        </Typography>
                    </Box>
                    <CalendarTodayIcon sx={{ fontSize: 48, opacity: 0.7 }} />
                </Box>
            </Paper>

            {/* Year Selector Tabs */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                <Paper elevation={2} sx={{ borderRadius: 6, bgcolor: '#fff', p: 0.5 }}>
                    <Tabs
                        value={selectedYear}
                        onChange={handleYearChange}
                        centered
                        indicatorColor="primary"
                        textColor="primary"
                        sx={{
                            '& .MuiTab-root': {
                                borderRadius: 5,
                                minWidth: 120,
                                fontWeight: 'bold',
                                fontSize: '1.1rem',
                                transition: 'all 0.3s',
                                '&.Mui-selected': {
                                    bgcolor: 'primary.main',
                                    color: 'white',
                                    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
                                }
                            },
                            '& .MuiTabs-indicator': { display: 'none' }
                        }}
                    >
                        {years.map(year => (
                            <Tab key={year} label={year} value={year} />
                        ))}
                    </Tabs>
                </Paper>
            </Box>

            {/* Month Cards Grid */}
            <Grid container spacing={2}>
                {months.map((m, index) => {
                    const isSelected = selectedMonth && selectedMonth.month === m.id && selectedMonth.year === selectedYear;

                    return (
                        <Grid item xs={6} sm={4} md={3} lg={2} key={m.id}>
                            <Fade in={true} style={{ transitionDelay: `${index * 30}ms` }}>
                                <Card
                                    elevation={isSelected ? 8 : 2}
                                    sx={{
                                        height: '100%',
                                        border: isSelected ? '3px solid #667eea' : '1px solid #e0e0e0',
                                        bgcolor: isSelected ? '#f0f4ff' : 'white',
                                        transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        '&:hover': {
                                            transform: 'translateY(-8px) scale(1.03)',
                                            boxShadow: '0 12px 24px rgba(102, 126, 234, 0.25)',
                                            borderColor: '#667eea'
                                        }
                                    }}
                                >
                                    <CardActionArea
                                        onClick={() => handleMonthSelect(m.id)}
                                        disabled={loading}
                                        sx={{
                                            height: '100%',
                                            p: 2,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <CardContent sx={{ textAlign: 'center', p: 0 }}>
                                            <Chip
                                                label={selectedYear}
                                                size="small"
                                                sx={{
                                                    mb: 1,
                                                    bgcolor: isSelected ? 'primary.main' : 'grey.300',
                                                    color: isSelected ? 'white' : 'grey.700',
                                                    fontWeight: 600
                                                }}
                                            />
                                            <Typography
                                                variant="h6"
                                                sx={{
                                                    fontWeight: 800,
                                                    color: isSelected ? 'primary.main' : 'text.primary',
                                                    mb: 0.5
                                                }}
                                            >
                                                {m.name}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: isSelected ? 'primary.dark' : 'text.secondary',
                                                    fontSize: '0.7rem'
                                                }}
                                            >
                                                {isSelected ? '✓ Terpilih' : 'Klik untuk lihat'}
                                            </Typography>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </Fade>
                        </Grid>
                    );
                })}
            </Grid>
        </Box>
    );
};

export default MonthYearSelector;