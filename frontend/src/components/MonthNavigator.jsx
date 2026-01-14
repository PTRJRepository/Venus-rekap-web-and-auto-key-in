import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    IconButton,
    Tabs,
    Tab,
    Select,
    MenuItem,
    FormControl,
    useTheme,
    useMediaQuery
} from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';

const MonthNavigator = ({ onFetch, loading }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);

    const months = [
        { value: 1, label: 'JAN', full: 'Januari' },
        { value: 2, label: 'FEB', full: 'Februari' },
        { value: 3, label: 'MAR', full: 'Maret' },
        { value: 4, label: 'APR', full: 'April' },
        { value: 5, label: 'MEI', full: 'Mei' },
        { value: 6, label: 'JUN', full: 'Juni' },
        { value: 7, label: 'JUL', full: 'Juli' },
        { value: 8, label: 'AGU', full: 'Agustus' },
        { value: 9, label: 'SEP', full: 'September' },
        { value: 10, label: 'OKT', full: 'Oktober' },
        { value: 11, label: 'NOV', full: 'November' },
        { value: 12, label: 'DES', full: 'Desember' },
    ];

    const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

    useEffect(() => {
        // Auto-fetch when month/year changes
        // Debounce slightly to prevent double-firing on init if needed, 
        // but simple effect is usually fine.
        // We only fetch if not loading to prevent spam, 
        // but we need to allow retries.
    }, [selectedMonth, selectedYear]);

    const handleMonthChange = (event, newValue) => {
        if (newValue !== null) {
            setSelectedMonth(newValue);
            onFetch(newValue, selectedYear);
        }
    };

    const handleYearChange = (event) => {
        const newYear = event.target.value;
        setSelectedYear(newYear);
        onFetch(selectedMonth, newYear);
    };

    const handlePrevYear = () => {
        const newYear = selectedYear - 1;
        setSelectedYear(newYear);
        onFetch(selectedMonth, newYear);
    };

    const handleNextYear = () => {
        const newYear = selectedYear + 1;
        setSelectedYear(newYear);
        onFetch(selectedMonth, newYear);
    };

    return (
        <Paper 
            elevation={1} 
            sx={{ 
                p: 0, 
                bgcolor: '#fff', 
                borderRadius: 2,
                overflow: 'hidden',
                mb: 2,
                borderBottom: '1px solid #e0e0e0'
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', p: 1, borderBottom: '1px solid #f0f0f0' }}>
                {/* Year Selector */}
                <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                    <IconButton onClick={handlePrevYear} size="small">
                        <ChevronLeft />
                    </IconButton>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', mx: 1, minWidth: 60, textAlign: 'center' }}>
                        {selectedYear}
                    </Typography>
                    <IconButton onClick={handleNextYear} size="small">
                        <ChevronRight />
                    </IconButton>
                </Box>

                <Box sx={{ flexGrow: 1 }} />

                {/* Status/Info Text */}
                <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' }, mr: 2 }}>
                    Menampilkan data: <b>{months.find(m => m.value === selectedMonth)?.full} {selectedYear}</b>
                </Typography>
            </Box>

            {/* Month Tabs */}
            <Tabs
                value={selectedMonth}
                onChange={handleMonthChange}
                variant="scrollable"
                scrollButtons="auto"
                indicatorColor="primary"
                textColor="primary"
                aria-label="month-selector"
                sx={{
                    minHeight: 48,
                    '& .MuiTab-root': {
                        minWidth: 70,
                        fontWeight: 600,
                        fontSize: '0.85rem'
                    }
                }}
            >
                {months.map((m) => (
                    <Tab 
                        key={m.value} 
                        label={m.label} 
                        value={m.value} 
                        disabled={loading}
                    />
                ))}
            </Tabs>
        </Paper>
    );
};

export default MonthNavigator;
