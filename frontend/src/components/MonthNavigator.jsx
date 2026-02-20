import React, { useState } from 'react';
import {
    Box,
    ToggleButtonGroup,
    ToggleButton,
    Typography,
    IconButton,
    Chip
} from '@mui/material';
import {
    NavigateBefore as PrevIcon,
    NavigateNext as NextIcon,
    Today as TodayIcon
} from '@mui/icons-material';

const MONTHS = [
    { id: 1, name: 'Jan', full: 'Januari' },
    { id: 2, name: 'Feb', full: 'Februari' },
    { id: 3, name: 'Mar', full: 'Maret' },
    { id: 4, name: 'Apr', full: 'April' },
    { id: 5, name: 'Mei', full: 'Mei' },
    { id: 6, name: 'Jun', full: 'Juni' },
    { id: 7, name: 'Jul', full: 'Juli' },
    { id: 8, name: 'Agt', full: 'Agustus' },
    { id: 9, name: 'Sep', full: 'September' },
    { id: 10, name: 'Okt', full: 'Oktober' },
    { id: 11, name: 'Nov', full: 'November' },
    { id: 12, name: 'Des', full: 'Desember' },
];

const MonthNavigator = ({ onFetch, loading }) => {
    const currentDate = new Date();
    const [year, setYear] = useState(currentDate.getFullYear());
    const [month, setMonth] = useState(currentDate.getMonth() + 1);

    const handleMonthChange = (event, newMonth) => {
        if (newMonth) {
            setMonth(newMonth);
            onFetch(newMonth, year);
        }
    };

    const handlePrevMonth = () => {
        let newMonth = month - 1;
        let newYear = year;
        if (newMonth < 1) {
            newMonth = 12;
            newYear = year - 1;
        }
        setMonth(newMonth);
        setYear(newYear);
        onFetch(newMonth, newYear);
    };

    const handleNextMonth = () => {
        let newMonth = month + 1;
        let newYear = year;
        if (newMonth > 12) {
            newMonth = 1;
            newYear = year + 1;
        }
        setMonth(newMonth);
        setYear(newYear);
        onFetch(newMonth, newYear);
    };

    const handleToday = () => {
        const today = new Date();
        const m = today.getMonth() + 1;
        const y = today.getFullYear();
        setMonth(m);
        setYear(y);
        onFetch(m, y);
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Year Selector */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" onClick={() => { setYear(year - 1); onFetch(month, year - 1); }}>
                    <PrevIcon fontSize="small" />
                </IconButton>
                <Chip
                    label={year}
                    sx={{
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        minWidth: 70,
                        bgcolor: '#f8fafc',
                        border: '1px solid #e2e8f0'
                    }}
                />
                <IconButton size="small" onClick={() => { setYear(year + 1); onFetch(month, year + 1); }}>
                    <NextIcon fontSize="small" />
                </IconButton>
            </Box>

            {/* Month Toggle Group */}
            <ToggleButtonGroup
                value={month}
                exclusive
                onChange={handleMonthChange}
                size="small"
                disabled={loading}
                sx={{
                    '& .MuiToggleButton-root': {
                        px: 1.5,
                        py: 0.5,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        border: '1px solid #e2e8f0',
                        color: '#64748b',
                        '&.Mui-selected': {
                            bgcolor: '#7c3aed',
                            color: 'white',
                            fontWeight: 700,
                            '&:hover': {
                                bgcolor: '#6d28d9'
                            }
                        },
                        '&:hover': {
                            bgcolor: '#f1f5f9'
                        }
                    }
                }}
            >
                {MONTHS.map(m => (
                    <ToggleButton key={m.id} value={m.id}>
                        {m.name}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>

            {/* Quick Actions */}
            <IconButton
                size="small"
                onClick={handleToday}
                sx={{
                    border: '1px solid #e2e8f0',
                    bgcolor: '#f8fafc',
                    '&:hover': { bgcolor: '#f1f5f9' }
                }}
            >
                <TodayIcon fontSize="small" />
            </IconButton>

            {/* Navigation Arrows */}
            <Box sx={{ display: 'flex', gap: 0.5 }}>
                <IconButton size="small" onClick={handlePrevMonth} disabled={loading}>
                    <PrevIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={handleNextMonth} disabled={loading}>
                    <NextIcon fontSize="small" />
                </IconButton>
            </Box>
        </Box>
    );
};

export default MonthNavigator;