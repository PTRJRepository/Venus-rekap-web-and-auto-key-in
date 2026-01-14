import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Chip, Box, Button 
} from '@mui/material';
import axios from 'axios';

const StagingPage = () => {
    const [stagingData, setStagingData] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchStagingData = async () => {
        try {
            setLoading(true);
            const response = await axios.get('http://localhost:5000/api/staging/data');
            if (response.data.success) {
                setStagingData(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching staging data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStagingData();
    }, []);

    return (
        <Container maxWidth={false}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" gutterBottom component="div" sx={{ fontWeight: 500, color: 'primary.main' }}>
                        Staging Data Manager
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Manage raw attendance records before processing.
                    </Typography>
                </Box>
                <Button variant="outlined" onClick={fetchStagingData}>
                    Refresh
                </Button>
            </Box>

            <TableContainer component={Paper} elevation={2}>
                <Table sx={{ minWidth: 650 }} size="small">
                    <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>Employee</TableCell>
                            <TableCell>Check In</TableCell>
                            <TableCell>Check Out</TableCell>
                            <TableCell>Reg Hrs</TableCell>
                            <TableCell>OT Hrs</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Charge Job (Raw)</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={8} align="center" sx={{ py: 3 }}>Loading...</TableCell>
                            </TableRow>
                        ) : stagingData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} align="center" sx={{ py: 3 }}>No records found</TableCell>
                            </TableRow>
                        ) : (
                            stagingData.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell>{row.date}</TableCell>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="bold">{row.employee_name}</Typography>
                                        <Typography variant="caption" color="text.secondary">{row.employee_id}</Typography>
                                    </TableCell>
                                    <TableCell>{row.check_in || '-'}</TableCell>
                                    <TableCell>{row.check_out || '-'}</TableCell>
                                    <TableCell>{row.regular_hours}</TableCell>
                                    <TableCell>{row.overtime_hours}</TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={row.status} 
                                            size="small" 
                                            color={row.status === 'staged' ? 'success' : 'default'}
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {row.raw_charge_job || '-'}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Container>
    );
};

export default StagingPage;
