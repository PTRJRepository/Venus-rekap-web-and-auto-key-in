import React, { useState } from 'react';
import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Tooltip,
    Typography,
    Chip,
    Avatar,
    Switch,
    FormControlLabel,
    TextField,
    IconButton,
    Snackbar,
    Alert,
    CircularProgress
} from '@mui/material';
import {
    CheckCircle as CheckIcon,
    Cancel as CancelIcon,
    Warning as WarningIcon,
    Flight as FlightIcon,
    LocalHospital as HospitalIcon,
    Person as PersonIcon,
    Edit as EditIcon,
    Save as SaveIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import { updateEmployeeMill } from '../services/api';

// CRITICAL FIX: Charge job is in employee.chargeJob, NOT in daily attendance
const AttendanceMatrix = ({ data = [], viewMode = 'attendance', onDataUpdate }) => {
    const safeData = Array.isArray(data) ? data : [];

    // Edit mode state
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingRow, setEditingRow] = useState(null);
    const [editValues, setEditValues] = useState({ ptrjEmployeeID: '', chargeJob: '' });
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    // Handle starting edit for a row
    const handleStartEdit = (employee) => {
        setEditingRow(employee.id);
        setEditValues({
            ptrjEmployeeID: employee.ptrjEmployeeID || '',
            chargeJob: employee.chargeJob || ''
        });
    };

    // Handle cancel edit
    const handleCancelEdit = () => {
        setEditingRow(null);
        setEditValues({ ptrjEmployeeID: '', chargeJob: '' });
    };

    // Handle save edit
    const handleSaveEdit = async (employee) => {
        setSaving(true);
        try {
            const result = await updateEmployeeMill(employee.id, {
                ptrj_employee_id: editValues.ptrjEmployeeID,
                charge_job: editValues.chargeJob
            });

            if (result.success) {
                setSnackbar({ open: true, message: 'Data berhasil disimpan!', severity: 'success' });
                setEditingRow(null);

                // Trigger parent refresh if callback provided
                if (onDataUpdate) {
                    onDataUpdate();
                }
            } else {
                setSnackbar({ open: true, message: result.error || 'Gagal menyimpan', severity: 'error' });
            }
        } catch (error) {
            setSnackbar({ open: true, message: error.message || 'Gagal menyimpan', severity: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (safeData.length === 0) {
        return (
            <Box sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#fafbfc'
            }}>
                <Box sx={{ textAlign: 'center', p: 4 }}>
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                        Pilih Periode
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Gunakan navigator di atas untuk menampilkan data absensi
                    </Typography>
                </Box>
            </Box>
        );
    }

    const daysMap = safeData[0]?.attendance || {};
    const dayNumbers = Object.keys(daysMap).sort((a, b) => Number(a) - Number(b));

    // Status color helper
    const getStatusColor = (statusRaw) => {
        const status = (statusRaw || '').toUpperCase();

        // 1. Hadir / Present
        if (status === 'HADIR') return { bg: '#ecfdf5', text: '#059669', icon: <CheckIcon sx={{ fontSize: 14, color: '#059669' }} />, label: 'H' };

        // 2. ALFA / Absent
        if (status === 'ALFA') return { bg: '#7f1d1d', text: '#ffffff', icon: <CancelIcon sx={{ fontSize: 14 }} />, label: 'A' };

        // 3. OFF / Holiday
        if (status === 'OFF') return { bg: '#f1f5f9', text: '#64748b', icon: null, label: 'OFF' };

        // 4. Overtime Only (Weekend work)
        if (status.includes('LEMBUR')) return { bg: '#fff7ed', text: '#c2410c', icon: null, label: 'OT' };

        // 5. Leave / Cuti / Izin
        if (['CT', 'CUTI', 'IZIN', 'I'].includes(status) || status.includes('LEAVE'))
            return { bg: '#eff6ff', text: '#1e40af', icon: <FlightIcon sx={{ fontSize: 12 }} />, label: status.substring(0, 2) };

        // 6. Sick / Sakit
        if (['S', 'SAKIT', 'SICK', 'SD'].includes(status))
            return { bg: '#fee2e2', text: '#b91c1c', icon: <HospitalIcon sx={{ fontSize: 12 }} />, label: 'S' };

        // 7. Menstrual / Haid (Commonly 'M' or 'M-Leave')
        if (['M', 'MENSTRUAL', 'HAID'].includes(status) || status.includes('HAID'))
            return { bg: '#fce7f3', text: '#be185d', icon: <HospitalIcon sx={{ fontSize: 12 }} />, label: 'M' }; // Pink for Menstrual

        // Default / Other
        return { bg: '#ffffff', text: '#1e293b', icon: null, label: statusRaw };
    };

    return (
        <Paper
            elevation={0}
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 1,
                overflow: 'hidden'
            }}
        >
            {/* Edit Mode Toggle Header - COMPACT */}
            <Box sx={{
                px: 1.5,
                py: 0.5,
                borderBottom: '1px solid #e5e7eb',
                bgcolor: isEditMode ? '#fef3c7' : '#f9fafb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 36
            }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={isEditMode}
                            onChange={(e) => {
                                setIsEditMode(e.target.checked);
                                if (!e.target.checked) {
                                    handleCancelEdit();
                                }
                            }}
                            color="warning"
                            size="small"
                        />
                    }
                    label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <EditIcon sx={{ fontSize: 14, color: isEditMode ? '#d97706' : '#9ca3af' }} />
                            <Typography
                                variant="caption"
                                sx={{
                                    fontWeight: isEditMode ? 600 : 400,
                                    color: isEditMode ? '#92400e' : '#6b7280',
                                    fontSize: '0.75rem'
                                }}
                            >
                                Edit Mode
                            </Typography>
                        </Box>
                    }
                    sx={{ m: 0 }}
                />
                {isEditMode && (
                    <Typography variant="caption" sx={{ color: '#92400e', fontSize: '0.7rem' }}>
                        Klik baris untuk edit PTRJ ID & Charge Job
                    </Typography>
                )}
            </Box>

            {/* Table Container - Takes all available space */}
            <TableContainer sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'auto' }}>
                <Table
                    stickyHeader
                    size="small"
                    sx={{
                        minWidth: 'max-content',
                        '& .MuiTableCell-root': {
                            borderRight: '1px solid #f3f4f6',
                            borderBottom: '1px solid #f3f4f6',
                            py: 0.75,
                            px: 1
                        }
                    }}
                >
                    <TableHead>
                        <TableRow>
                            {/* ONLY Name Column is Sticky */}
                            <TableCell
                                sx={{
                                    position: 'sticky',
                                    left: 0,
                                    zIndex: 100,
                                    bgcolor: '#f9fafb',
                                    width: 220,
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    color: '#374151',
                                    boxShadow: '2px 0 5px rgba(0,0,0,0.08)',
                                    borderRight: '2px solid #cbd5e1 !important'
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PersonIcon fontSize="small" color="disabled" />
                                    NAMA KARYAWAN
                                </Box>
                            </TableCell>

                            {/* PTRJ ID - Scrollable */}
                            <TableCell
                                sx={{
                                    bgcolor: isEditMode ? '#fef3c7' : '#f9fafb',
                                    width: 130,
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    color: isEditMode ? '#92400e' : '#64748b'
                                }}
                            >
                                {isEditMode && <EditIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />}
                                PTRJ ID
                            </TableCell>

                            {/* Charge Job - Scrollable */}
                            <TableCell
                                sx={{
                                    bgcolor: isEditMode ? '#fef3c7' : '#fef8ed',
                                    width: 250,
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    color: '#92400e',
                                    borderRight: '2px solid #f59e0b !important'
                                }}
                            >
                                {isEditMode && <EditIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />}
                                ⚙️ CHARGE JOB
                            </TableCell>

                            {/* Date Columns */}
                            {dayNumbers.map(day => {
                                const d = daysMap[day];
                                const isHoliday = d?.isHoliday;
                                const isSun = d?.isSunday;

                                return (
                                    <TableCell
                                        key={day}
                                        align="center"
                                        sx={{
                                            width: 50,
                                            bgcolor: isHoliday ? '#fef2f2' : (isSun ? '#fff1f2' : '#ffffff'),
                                            color: isHoliday ? '#dc2626' : (isSun ? '#e11d48' : '#111827'),
                                            fontWeight: 600,
                                            fontSize: '0.75rem'
                                        }}
                                    >
                                        <Box sx={{ lineHeight: 1.2 }}>
                                            <div style={{ fontWeight: 700, color: isSun ? '#e11d48' : 'inherit' }}>{day}</div>
                                            <div style={{
                                                fontSize: '0.65rem',
                                                opacity: isSun ? 1 : 0.7,
                                                color: isSun ? '#e11d48' : 'inherit',
                                                fontWeight: isSun ? 700 : 400
                                            }}>
                                                {d?.dayName?.substring(0, 3).toUpperCase()}
                                            </div>
                                        </Box>
                                    </TableCell>
                                );
                            })}

                            {/* Summary Columns */}
                            <TableCell align="center" sx={{ bgcolor: '#f0fdf4', fontWeight: 700, fontSize: '0.7rem', borderLeft: '2px solid #10b981 !important' }}>
                                HADIR
                            </TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#fff7ed', fontWeight: 700, fontSize: '0.7rem' }}>
                                LEMBUR (H)
                            </TableCell>
                            <TableCell align="center" sx={{ bgcolor: '#fef2f2', fontWeight: 700, fontSize: '0.7rem', color: '#b91c1c' }}>
                                ALFA
                            </TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {safeData.map((employee, index) => {
                            const isEven = index % 2 === 0;
                            const isEditing = editingRow === employee.id;

                            // Calculate totals
                            let totalHadir = 0;
                            let totalOT = 0;
                            let totalAlfa = 0;

                            dayNumbers.forEach(day => {
                                const d = employee.attendance[day];
                                if (!d) return;

                                if (d.status === 'Hadir' || d.regularHours > 0) totalHadir++;
                                if (d.status === 'ALFA') totalAlfa++;
                                if (d.overtimeHours > 0) totalOT += d.overtimeHours;
                            });

                            return (
                                <TableRow
                                    key={employee.id}
                                    hover
                                    onClick={() => isEditMode && !isEditing && handleStartEdit(employee)}
                                    sx={{
                                        bgcolor: isEditing ? '#fef3c7' : (isEven ? '#ffffff' : '#fafbfc'),
                                        cursor: isEditMode ? 'pointer' : 'default',
                                        '&:hover': {
                                            bgcolor: isEditing ? '#fef3c7' : (isEditMode ? '#fef9c3' : '#f0f9ff')
                                        }
                                    }}
                                >
                                    {/* Employee Name (ONLY STICKY) */}
                                    <TableCell
                                        sx={{
                                            position: 'sticky',
                                            left: 0,
                                            zIndex: 50,
                                            bgcolor: 'inherit',
                                            boxShadow: '3px 0 6px rgba(0,0,0,0.06)',
                                            fontWeight: 600,
                                            color: '#111827',
                                            borderRight: '2px solid #cbd5e1 !important'
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: isEditing ? '#d97706' : '#7c3aed' }}>
                                                {employee.name.charAt(0)}
                                            </Avatar>
                                            <Typography variant="body2" noWrap sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
                                                {employee.name}
                                            </Typography>
                                            {isEditing && (
                                                <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
                                                    <IconButton
                                                        size="small"
                                                        color="success"
                                                        onClick={(e) => { e.stopPropagation(); handleSaveEdit(employee); }}
                                                        disabled={saving}
                                                    >
                                                        {saving ? <CircularProgress size={16} /> : <SaveIcon fontSize="small" />}
                                                    </IconButton>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
                                                        disabled={saving}
                                                    >
                                                        <CloseIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            )}
                                        </Box>
                                    </TableCell>

                                    {/* PTRJ ID - Editable */}
                                    <TableCell
                                        sx={{
                                            bgcolor: isEditing ? '#fef9c3' : 'inherit',
                                            color: '#6b7280',
                                            fontFamily: 'monospace',
                                            fontSize: '0.75rem'
                                        }}
                                        onClick={(e) => isEditing && e.stopPropagation()}
                                    >
                                        {isEditing ? (
                                            <TextField
                                                size="small"
                                                value={editValues.ptrjEmployeeID}
                                                onChange={(e) => setEditValues(prev => ({ ...prev, ptrjEmployeeID: e.target.value }))}
                                                sx={{
                                                    width: '100%',
                                                    '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 }
                                                }}
                                                placeholder="PTRJ ID"
                                            />
                                        ) : (
                                            employee.ptrjEmployeeID || '-'
                                        )}
                                    </TableCell>

                                    {/* CHARGE JOB - Editable */}
                                    <TableCell
                                        sx={{
                                            bgcolor: isEditing ? '#fef9c3' : (isEven ? '#fffaf0' : '#fef8ed'),
                                            borderRight: '2px solid #f59e0b !important'
                                        }}
                                        onClick={(e) => isEditing && e.stopPropagation()}
                                    >
                                        {isEditing ? (
                                            <TextField
                                                size="small"
                                                value={editValues.chargeJob}
                                                onChange={(e) => setEditValues(prev => ({ ...prev, chargeJob: e.target.value }))}
                                                sx={{
                                                    width: '100%',
                                                    '& .MuiInputBase-input': { fontSize: '0.7rem', py: 0.5 }
                                                }}
                                                placeholder="Charge Job (Task|Station|Machine|Expense)"
                                            />
                                        ) : (
                                            employee.chargeJob && employee.chargeJob !== '-' ? (
                                                <Tooltip title={employee.chargeJob} arrow placement="top">
                                                    <Chip
                                                        label={employee.chargeJob}
                                                        size="small"
                                                        sx={{
                                                            height: 22,
                                                            fontSize: '0.7rem',
                                                            maxWidth: 200,
                                                            bgcolor: '#fff7ed',
                                                            border: '1px solid #f59e0b',
                                                            color: '#92400e',
                                                            fontWeight: 500,
                                                            '& .MuiChip-label': {
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis'
                                                            }
                                                        }}
                                                    />
                                                </Tooltip>
                                            ) : (
                                                <Typography variant="caption" sx={{ color: '#9ca3af', fontStyle: 'italic' }}>
                                                    -
                                                </Typography>
                                            )
                                        )}
                                    </TableCell>

                                    {/* Daily Attendance Cells */}
                                    {dayNumbers.map(day => {
                                        const d = employee.attendance[day];
                                        if (!d) return <TableCell key={day} sx={{ bgcolor: '#fafafa' }} />;

                                        const statusStyle = getStatusColor(d.status);
                                        const regH = d.regularHours || 0;
                                        const otH = d.overtimeHours || 0;

                                        const tooltipContent = (
                                            <Box sx={{ p: 1 }}>
                                                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{d.date}</Typography>
                                                <Typography variant="body2">Status: <b>{d.status}</b></Typography>
                                                <Typography variant="caption">In/Out: {d.checkIn || '--'} - {d.checkOut || '--'}</Typography>
                                                <Typography variant="caption" display="block">Reg: {regH}h | OT: {otH}h</Typography>
                                            </Box>
                                        );

                                        // Render Content Logic
                                        let cellContent;
                                        if (d.status === 'Hadir') {
                                            if (viewMode === 'attendance') {
                                                cellContent = <CheckIcon sx={{ fontSize: 16, color: '#059669' }} />;
                                            } else if (viewMode === 'overtime') {
                                                cellContent = (
                                                    <Box>
                                                        <CheckIcon sx={{ fontSize: 14, color: '#059669' }} />
                                                        {otH > 0 && <div style={{ fontSize: '0.65rem', color: '#c2410c', fontWeight: 700 }}>+{otH}</div>}
                                                    </Box>
                                                );
                                            } else {
                                                cellContent = (
                                                    <Box>
                                                        {regH > 0 && <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{regH}</div>}
                                                        {otH > 0 && <div style={{ fontSize: '0.65rem', color: '#c2410c', fontWeight: 700 }}>+{otH}</div>}
                                                    </Box>
                                                );
                                            }
                                        } else {
                                            // Handling for ALL other statuses (ALFA, S, I, M, etc.)
                                            cellContent = (
                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3 }}>
                                                    {statusStyle.icon}
                                                    <span style={{ fontSize: viewMode === 'detail' ? '0.7rem' : '0.65rem', fontWeight: 700 }}>
                                                        {statusStyle.label}
                                                    </span>
                                                </Box>
                                            );
                                        }

                                        // Check if this day is Sunday for special styling
                                        const isSundayCell = d?.isSunday;

                                        return (
                                            <Tooltip key={day} title={tooltipContent} arrow>
                                                <TableCell
                                                    align="center"
                                                    sx={{
                                                        bgcolor: isSundayCell ? '#fff1f2' : statusStyle.bg,
                                                        color: statusStyle.text,
                                                        fontWeight: 600,
                                                        fontSize: '0.75rem',
                                                        cursor: 'crosshair',
                                                        transition: 'all 0.1s',
                                                        borderLeft: isSundayCell ? '1px solid #fecdd3' : undefined,
                                                        borderRight: isSundayCell ? '1px solid #fecdd3' : undefined,
                                                        '&:hover': {
                                                            filter: 'brightness(0.95)',
                                                            zIndex: 10
                                                        }
                                                    }}
                                                >
                                                    {cellContent}
                                                </TableCell>
                                            </Tooltip>
                                        );
                                    })}

                                    {/* Summary Cells */}
                                    <TableCell align="center" sx={{ bgcolor: '#f0fdf4', fontWeight: 700, borderLeft: '2px solid #10b981 !important' }}>
                                        {totalHadir}
                                    </TableCell>
                                    <TableCell align="center" sx={{ bgcolor: '#fff7ed', fontWeight: 700, color: '#c2410c' }}>
                                        {totalOT.toFixed(1).replace('.0', '')}
                                    </TableCell>
                                    <TableCell align="center" sx={{ bgcolor: '#fef2f2', fontWeight: 700, color: '#b91c1c' }}>
                                        {totalAlfa}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Snackbar for notifications */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                    severity={snackbar.severity}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Paper>
    );
};

export default AttendanceMatrix;
