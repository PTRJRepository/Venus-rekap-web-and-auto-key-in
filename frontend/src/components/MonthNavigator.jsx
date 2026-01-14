import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Select,
    MenuItem,
    FormControl,
    InputBase
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { ChevronLeft, ChevronRight, CalendarMonth } from '@mui/icons-material';

// Styled select for seamless integration
const StyledSelect = styled(InputBase)(({ theme }) => ({
    '& .MuiInputBase-input': {
        borderRadius: 4,
        position: 'relative',
        backgroundColor: 'transparent',
        border: '1px solid transparent',
        fontSize: '0.9rem',
        fontWeight: 600,
        padding: '4px 26px 4px 12px',
        transition: theme.transitions.create(['border-color', 'background-color']),
        fontFamily: theme.typography.fontFamily,
        '&:focus': {
            borderColor: theme.palette.primary.main,
            borderRadius: 4,
        },
        '&:hover': {
            backgroundColor: theme.palette.action.hover,
        }
    },
}));

const MonthNavigator = ({ onFetch, loading }) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);

    const months = [
        { value: 1, label: 'Januari' }, { value: 2, label: 'Februari' },
        { value: 3, label: 'Maret' }, { value: 4, label: 'April' },
        { value: 5, label: 'Mei' }, { value: 6, label: 'Juni' },
        { value: 7, label: 'Juli' }, { value: 8, label: 'Agustus' },
        { value: 9, label: 'September' }, { value: 10, label: 'Oktober' },
        { value: 11, label: 'November' }, { value: 12, label: 'Desember' },
    ];

    const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

    useEffect(() => {
        // Initial fetch on mount is handled by App.jsx defaults or user action?
        // Let's trigger it once on mount if needed, or rely on user.
        // Actually, App.jsx relies on this component triggering changes.
        onFetch(selectedMonth, selectedYear);
    }, []); // Run once on mount

    const handleMonthChange = (event) => {
        const newValue = event.target.value;
        setSelectedMonth(newValue);
        onFetch(newValue, selectedYear);
    };

    const handleYearChange = (event) => {
        const newYear = event.target.value;
        setSelectedYear(newYear);
        onFetch(selectedMonth, newYear);
    };

    const handlePrevMonth = () => {
        let newMonth = selectedMonth - 1;
        let newYear = selectedYear;
        if (newMonth < 1) {
            newMonth = 12;
            newYear -= 1;
        }
        setSelectedMonth(newMonth);
        setSelectedYear(newYear);
        onFetch(newMonth, newYear);
    };

    const handleNextMonth = () => {
        let newMonth = selectedMonth + 1;
        let newYear = selectedYear;
        if (newMonth > 12) {
            newMonth = 1;
            newYear += 1;
        }
        setSelectedMonth(newMonth);
        setSelectedYear(newYear);
        onFetch(newMonth, newYear);
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={handlePrevMonth} size="small" disabled={loading}>
                <ChevronLeft fontSize="small" />
            </IconButton>

            <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                border: '1px solid #e2e8f0', 
                borderRadius: 1, 
                px: 1, 
                py: 0.5,
                bgcolor: '#fff'
            }}>
                <CalendarMonth fontSize="small" sx={{ mr: 1, color: 'text.secondary', fontSize: '1rem' }} />
                
                <Select
                    value={selectedMonth}
                    onChange={handleMonthChange}
                    variant="standard"
                    disableUnderline
                    input={<StyledSelect />}
                    disabled={loading}
                    MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}
                >
                    {months.map((m) => (
                        <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                    ))}
                </Select>

                <Typography variant="body2" sx={{ mx: 0.5, color: 'text.secondary' }}>/</Typography>

                <Select
                    value={selectedYear}
                    onChange={handleYearChange}
                    variant="standard"
                    disableUnderline
                    input={<StyledSelect />}
                    disabled={loading}
                >
                    {years.map((y) => (
                        <MenuItem key={y} value={y}>{y}</MenuItem>
                    ))}
                </Select>
            </Box>

            <IconButton onClick={handleNextMonth} size="small" disabled={loading}>
                <ChevronRight fontSize="small" />
            </IconButton>
        </Box>
    );
};

export default MonthNavigator;