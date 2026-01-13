import React, { useState } from 'react';
import {
    Box,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Button,
    Paper,
} from '@mui/material';
import { CalendarMonth } from '@mui/icons-material';

const MonthYearSelector = ({ onFetch, loading }) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const [month, setMonth] = useState(currentMonth);
    const [year, setYear] = useState(currentYear);

    const months = [
        { value: 1, name: 'Januari' },
        { value: 2, name: 'Februari' },
        { value: 3, name: 'Maret' },
        { value: 4, name: 'April' },
        { value: 5, name: 'Mei' },
        { value: 6, name: 'Juni' },
        { value: 7, name: 'Juli' },
        { value: 8, name: 'Agustus' },
        { value: 9, name: 'September' },
        { value: 10, name: 'Oktober' },
        { value: 11, name: 'November' },
        { value: 12, name: 'Desember' },
    ];

    const years = [];
    for (let i = currentYear - 2; i <= currentYear + 1; i++) {
        years.push(i);
    }

    const handleFetch = () => {
        onFetch(month, year);
    };

    return (
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Box display="flex" gap={2} alignItems="center">
                <FormControl sx={{ minWidth: 200 }}>
                    <InputLabel id="month-label">Bulan</InputLabel>
                    <Select
                        labelId="month-label"
                        value={month}
                        label="Bulan"
                        onChange={(e) => setMonth(e.target.value)}
                    >
                        {months.map((m) => (
                            <MenuItem key={m.value} value={m.value}>
                                {m.name}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <FormControl sx={{ minWidth: 150 }}>
                    <InputLabel id="year-label">Tahun</InputLabel>
                    <Select
                        labelId="year-label"
                        value={year}
                        label="Tahun"
                        onChange={(e) => setYear(e.target.value)}
                    >
                        {years.map((y) => (
                            <MenuItem key={y} value={y}>
                                {y}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <Button
                    variant="contained"
                    startIcon={<CalendarMonth />}
                    onClick={handleFetch}
                    disabled={loading}
                    sx={{ height: 56 }}
                >
                    {loading ? 'Memuat...' : 'Tampilkan'}
                </Button>
            </Box>
        </Paper>
    );
};

export default MonthYearSelector;
