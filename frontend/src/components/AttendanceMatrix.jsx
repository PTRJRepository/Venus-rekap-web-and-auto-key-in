import React, { useState, useEffect } from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Tooltip, Typography, Avatar, IconButton, Snackbar, Alert, Checkbox, LinearProgress, Collapse, Grid, Fade, CircularProgress, Chip, TextField, Button, FormControlLabel, Switch } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EventIcon from '@mui/icons-material/Event';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { updateEmployeeMill } from '../services/api';

const AttendanceMatrix = ({
    data = [],
    viewMode = 'attendance',
    onDataUpdate,
    selectedIds = [],
    onToggleSelect,
    compareMode = 'off',
    comparisonData = null,
    isLoadingComparison = false,
    isEditMode = false,
    setIsEditMode
}) => {
    const safeData = Array.isArray(data) ? data : [];
    const [editingRow, setEditingRow] = useState(null);
    const [editValues, setEditValues] = useState({ ptrjEmployeeID: '', chargeJob: '', employeeName: '', isKaryawan: true });
    const [saving, setSaving] = useState(false);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    // AGGRESSIVE DEBUGGING
    useEffect(() => {
        if (compareMode !== 'off') {
            console.log('%c [MATRIX SYNC DEBUG] %c Compare Mode:', 'background: #0052CC; color: #fff; font-weight: bold;', 'color: #0052CC', compareMode);
            console.log('Has comparisonData:', !!comparisonData);
            if (comparisonData) {
                const keys = Object.keys(comparisonData);
                console.log('Comparison Data Keys count:', keys.length);
                if (keys.length > 0) {
                    console.log('Sample Key from data:', keys[0]);
                    console.log('Sample Value:', comparisonData[keys[0]]);
                }
            }
        }
    }, [comparisonData, compareMode]);

    const toggleRow = (id) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedRows(newExpanded);
    };

    const handleStartEdit = (emp) => {
        setEditingRow(emp.id);
        setEditValues({
            ptrjEmployeeID: emp.ptrjEmployeeID || '',
            chargeJob: emp.chargeJob || '',
            employeeName: emp.name || '',
            isKaryawan: emp.isKaryawan !== false
        });
    };

    const handleCancelEdit = () => {
        setEditingRow(null);
        setEditValues({ ptrjEmployeeID: '', chargeJob: '', employeeName: '', isKaryawan: true });
    };

    const handleSaveEdit = async (emp) => {
        setSaving(true);
        try {
            const result = await updateEmployeeMill(emp.id, {
                ptrj_employee_id: editValues.ptrjEmployeeID,
                charge_job: editValues.chargeJob,
                employee_name: editValues.employeeName,
                is_karyawan: editValues.isKaryawan
            });
            if (result.success) {
                setSnackbar({ open: true, message: 'Data tersimpan!', severity: 'success' });
                setEditingRow(null);
                if (onDataUpdate) {
                    onDataUpdate({
                        type: 'update_employee',
                        id: emp.id,
                        updates: {
                            name: editValues.employeeName,
                            ptrjEmployeeID: editValues.ptrjEmployeeID,
                            chargeJob: editValues.chargeJob,
                            isKaryawan: editValues.isKaryawan
                        }
                    });
                }
            }
            else setSnackbar({ open: true, message: result.error || 'Gagal', severity: 'error' });
        } catch (e) { setSnackbar({ open: true, message: e.message, severity: 'error' }); }
        finally { setSaving(false); }
    };

    const handleSelectRow = (id) => { if (onToggleSelect) onToggleSelect(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]); };

    const getStatusUI = (s) => {
        const st = (s || '').toUpperCase();
        if (st === 'HADIR') return { bg: '#E8F5E9', text: '#2E7D32', icon: <CheckCircleIcon sx={{ fontSize: 16 }} />, label: 'H' };
        if (st === 'ALFA') return { bg: '#FFEBEE', text: '#C62828', icon: <CancelIcon sx={{ fontSize: 16 }} />, label: 'A' };
        if (st === 'OFF') return { bg: '#F5F5F5', text: '#757575', icon: null, label: 'OFF' };
        if (['CT', 'CUTI', 'I', 'IZIN'].includes(st)) return { bg: '#E3F2FD', text: '#1565C0', icon: <EventIcon sx={{ fontSize: 16 }} />, label: st.substring(0, 2) };
        if (['S', 'SAKIT', 'SD'].includes(st)) return { bg: '#FFF9C4', text: '#F9A825', icon: <MedicalServicesIcon sx={{ fontSize: 16 }} />, label: 'S' };
        return { bg: '#fff', text: '#172B4D', icon: null, label: s };
    };

    const getCellContent = (d, viewMode) => {
        if (!d) return null;
        if (viewMode === 'overtime') {
            const otHours = Number(d.overtimeHours) || 0;
            if (otHours > 0) {
                return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#9C27B0', py: 0.2 }}>
                        <AccessTimeIcon sx={{ fontSize: 12 }} />
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 800 }}>{otHours}h</Typography>
                    </Box>
                );
            }
            return <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>-</Typography>;
        }
        if (viewMode === 'detail') {
            const regHours = Number(d.regularHours) || 0;
            const otHours = Number(d.overtimeHours) || 0;
            return (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#172B4D', py: 0.2, fontSize: '0.6rem', lineHeight: 1 }}>
                    {regHours > 0 ? <Typography sx={{ fontSize: '0.65rem', fontWeight: 700 }}>{regHours}h</Typography> : null}
                    {otHours > 0 ? <Typography sx={{ fontSize: '0.55rem', color: '#9C27B0', fontWeight: 700 }}>+{otHours}h</Typography> : null}
                    {regHours === 0 && otHours === 0 ? <Typography sx={{ fontSize: '0.6rem', color: '#757575' }}>-</Typography> : null}
                </Box>
            );
        }
        const ui = getStatusUI(d.status);
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: ui.text, py: 0.4 }}>
                {ui.icon ? React.cloneElement(ui.icon, { sx: { fontSize: 14 } }) : <Typography sx={{ fontSize: '0.65rem', fontWeight: 800 }}>{ui.label}</Typography>}
            </Box>
        );
    };

    const today = new Date().getDate();
    const daysMap = safeData[0]?.attendance || {};
    const dayNumbers = Object.keys(daysMap).sort((a, b) => Number(a) - Number(b));

    const getSyncStatus = (ptrjId, dateStr, venusStatus, venusRegularHours = 0, venusOtHours = 0) => {
        // When compareMode is active but no valid PTRJ ID - show as NOT SYNCED (red border)
        if (!compareMode || compareMode === 'off') return null;

        // Check if employee has valid PTRJ ID
        const hasValidPtrjId = ptrjId && ptrjId !== 'N/A' && String(ptrjId).trim() !== '';

        if (!hasValidPtrjId) {
            // Employee not mapped - show red border indicating not synced
            return { status: 'not_synced', displayOverride: 'N/A', displayColor: '#DE350B', borderWidth: 2, isUnmapped: true };
        }

        if (!comparisonData) return null;

        // NORMALIZE DATE: Extract only YYYY-MM-DD if ISO
        const cleanDate = String(dateStr).includes('T') ? dateStr.split('T')[0] : dateStr;
        const normId = String(ptrjId).trim();
        const key = `${normId}_${cleanDate}`;
        const millwareRecord = comparisonData[key];

        if (['ALFA', 'N/A', 'OFF'].includes(venusStatus?.toUpperCase())) return null;

        const date = new Date(cleanDate);
        const isSunday = date.getDay() === 0;
        const isSaturday = date.getDay() === 6;
        const expectedHours = isSunday ? 0 : (isSaturday ? 5 : 7);
        const millwareHours = millwareRecord ? (millwareRecord.normal || 0) : 0;
        const isBelowThreshold = !isSunday && millwareHours > 0 && millwareHours < expectedHours;

        if (compareMode === 'presence') {
            if (!millwareRecord || !millwareRecord.hasRegularRecord) {
                return { status: 'not_synced', displayOverride: `${venusRegularHours}h`, displayColor: '#DE350B', borderWidth: 2 };
            }
            if (!millwareRecord.regularMatched) {
                return { status: 'mismatch', displayOverride: `${venusRegularHours}h|${millwareRecord.normal}h`, displayColor: '#FF991F', borderWidth: 2, millwareHours, isBelowThreshold };
            }
            return { status: 'synced', millwareHours, isBelowThreshold, borderWidth: 1 };
        }

        if (compareMode === 'overtime') {
            const vOT = Number(venusOtHours) || 0;
            if (vOT <= 0) return null;
            if (!millwareRecord || !millwareRecord.hasOTRecord) {
                return { status: 'not_synced', displayOverride: `${vOT}h`, displayColor: '#DE350B', borderWidth: 2 };
            }
            if (!millwareRecord.otMatched) {
                return { status: 'mismatch', displayOverride: `${vOT}h|${millwareRecord.ot}h`, displayColor: '#FF991F', borderWidth: 2, millwareHours: millwareRecord.ot || 0 };
            }
            return { status: 'synced', millwareHours: millwareRecord.ot || 0, borderWidth: 1 };
        }
        return null;
    };

    const getSyncStyle = (sync, isToday) => {
        if (!sync) return {
            boxShadow: isToday ? 'inset 0 0 0 1px #2196F3' : 'none'
        };

        const colors = { synced: '#00875A', not_synced: '#DE350B', mismatch: '#FF991F' };
        const color = colors[sync.status] || '#ccc';

        const shadow = `inset 0 0 0 ${sync.borderWidth || 1}px ${color}${isToday ? ', inset 0 0 0 2px #2196F3' : ''}`;

        // Special styling for unmapped employees (N/A PTRJ ID)
        if (sync.isUnmapped) {
            return {
                boxShadow: shadow,
                bgcolor: 'rgba(222, 53, 11, 0.08)',
                backgroundImage: sync.isUnmapped ? 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(222, 53, 11, 0.05) 2px, rgba(222, 53, 11, 0.05) 4px)' : 'none'
            };
        }

        return {
            boxShadow: shadow,
            bgcolor: sync.status === 'not_synced' ? 'rgba(222, 53, 11, 0.03)' : (sync.status === 'mismatch' ? 'rgba(255, 153, 31, 0.03)' : 'inherit'),
            ...(sync.isBelowThreshold ? { bgcolor: 'rgba(255, 153, 31, 0.08)' } : {})
        };
    };

    return (
        <Paper elevation={0} sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #DFE1E6', borderRadius: 2, position: 'relative' }}>
            {/* OVERLAY LOADING FORCED */}
            <Fade in={isLoadingComparison}>
                <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    bgcolor: 'rgba(15, 32, 64, 0.6)', zIndex: 2000,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(2px)', color: '#fff', gap: 2
                }}>
                    <CircularProgress color="inherit" size={48} thickness={5} />
                    <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '0.1em' }}>SYNCING WITH MILLWARE...</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.8 }}>Harap tunggu, sedang membandingkan ribuan baris data.</Typography>
                </Box>
            </Fade>

            {isLoadingComparison && <LinearProgress sx={{ height: 3 }} />}

            <TableContainer sx={{ flexGrow: 1 }}>
                <Table stickyHeader size="small" sx={{
                    minWidth: 'max-content',
                    '& .MuiTableCell-root': {
                        borderRight: '1px solid #F0F0F0',
                        borderBottom: '1px solid #F0F0F0',
                        py: 0.4,
                        px: 0.5,
                        fontSize: '0.7rem'
                    }
                }}>
                    <TableHead>
                        <TableRow sx={{ height: 32 }}>
                            <TableCell sx={{ position: 'sticky', left: 0, zIndex: 112, bgcolor: '#F4F5F7', width: 32, p: 0 }} align="center"><Checkbox size="small" sx={{ p: 0.5 }} /></TableCell>
                            <TableCell sx={{ position: 'sticky', left: 32, zIndex: 112, bgcolor: '#F4F5F7', width: 180, fontWeight: 800, borderRight: '2px solid #C1C7D0 !important' }}>KARYAWAN</TableCell>
                            <TableCell sx={{ position: 'sticky', left: 212, zIndex: 112, bgcolor: '#F4F5F7', width: 80, fontWeight: 800, borderRight: '2px solid #C1C7D0 !important' }}>ID PTRJ</TableCell>
                            {dayNumbers.map(day => {
                                const d = daysMap[day];
                                const isToday = Number(day) === today;
                                const isWeeklySplit = d?.dayName === 'Min';
                                return (
                                    <TableCell key={day} align="center" sx={{
                                        width: 34, bgcolor: isToday ? '#E3F2FD' : '#F4F5F7',
                                        borderRight: isWeeklySplit ? '2px solid #C1C7D0 !important' : '1px solid #F0F0F0',
                                        boxShadow: isToday ? 'inset 0 -2px 0 #2196F3' : 'none',
                                        p: 0
                                    }}>
                                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: isToday ? '#1976D2' : 'inherit', lineHeight: 1 }}>{day}</Typography>
                                        <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, opacity: 0.6, lineHeight: 1 }}>{d?.dayName?.substring(0, 2).toUpperCase()}</Typography>
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {safeData.map((emp) => {
                            const isSelected = selectedIds.includes(emp.id);
                            const isExpanded = expandedRows.has(emp.id);
                            const isEditing = editingRow === emp.id;

                            let attendanceCount = 0;
                            let overtimeHoursCount = 0;
                            let overtimeDaysCount = 0;

                            if (emp.attendance) {
                                Object.values(emp.attendance).forEach(d => {
                                    if (d && d.status) {
                                        const st = d.status.toUpperCase();
                                        if (st !== 'ALFA') {
                                            attendanceCount++;
                                        }
                                    }
                                    if (d && Number(d.overtimeHours) > 0) {
                                        overtimeHoursCount += Number(d.overtimeHours);
                                        overtimeDaysCount++;
                                    }
                                });
                            }

                            // Check if employee is non-karyawan (shouldn't happen after filter, but just in case)
                            const isNonKaryawan = emp.isKaryawan === false;

                            return (
                                <React.Fragment key={emp.id}>
                                    <TableRow hover selected={isSelected} sx={{ height: 32, bgcolor: isEditing ? '#FFF9C4' : (isNonKaryawan ? 'rgba(255, 152, 0, 0.1)' : 'inherit') }}>
                                        <TableCell sx={{ position: 'sticky', left: 0, zIndex: 101, bgcolor: 'inherit', p: 0 }} align="center">
                                            <IconButton size="small" onClick={() => toggleRow(emp.id)} sx={{ p: 0.2 }}>{isExpanded ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}</IconButton>
                                        </TableCell>
                                        <TableCell sx={{ position: 'sticky', left: 32, zIndex: 101, bgcolor: isNonKaryawan ? 'rgba(255, 152, 0, 0.15)' : 'inherit', borderRight: '2px solid #F0F0F0 !important' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Avatar sx={{ width: 20, height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: isNonKaryawan ? 'warning.light' : 'primary.light', flexShrink: 0 }}>{emp.name.charAt(0)}</Avatar>
                                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: isNonKaryawan ? 'warning.dark' : '#172B4D', noWrap: true, textOverflow: 'ellipsis', overflow: 'hidden' }}>{emp.name}</Typography>
                                                {isNonKaryawan && <Chip size="small" label="NON-KARYAWAN" sx={{ height: 14, fontSize: '0.55rem', fontWeight: 800, bgcolor: 'warning.main', color: 'white', '& .MuiChip-label': { px: 0.5 } }} />}
                                                {viewMode === 'attendance' && (
                                                    <Chip size="small" label={attendanceCount} sx={{ height: 16, minWidth: 20, fontSize: '0.6rem', fontWeight: 800, bgcolor: '#E8F5E9', color: '#2E7D32', '& .MuiChip-label': { px: 0.5 }, ml: 'auto', flexShrink: 0 }} />
                                                )}
                                                {viewMode === 'overtime' && (
                                                    <Chip size="small" label={`${overtimeHoursCount}h/${overtimeDaysCount}hr`} sx={{ height: 16, fontSize: '0.6rem', fontWeight: 800, bgcolor: '#F3E5F5', color: '#9C27B0', '& .MuiChip-label': { px: 0.5 }, ml: 'auto', flexShrink: 0 }} />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell
                                            sx={{
                                                position: 'sticky',
                                                left: 212,
                                                zIndex: 101,
                                                bgcolor: isEditing ? '#FFF8E1' : 'inherit',
                                                borderRight: '2px solid #F0F0F0 !important',
                                                cursor: 'pointer',
                                                '&:hover': { bgcolor: 'action.hover' }
                                            }}
                                            onClick={() => handleStartEdit(emp)}
                                        >
                                            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: emp.ptrjEmployeeID ? 'secondary.main' : 'text.disabled' }}>
                                                {emp.ptrjEmployeeID || 'N/A'}
                                            </Typography>
                                            {isEditMode && <Typography sx={{ fontSize: '0.5rem', color: 'warning.main' }}>Klik untuk edit</Typography>}
                                        </TableCell>

                                        {dayNumbers.map(day => {
                                            const d = emp.attendance?.[day];
                                            if (!d) return <TableCell key={day} />;
                                            const ui = getStatusUI(d.status);
                                            const isToday = Number(day) === today;
                                            const isWeeklySplit = d?.dayName === 'Min';
                                            const sync = getSyncStatus(emp.ptrjEmployeeID, d.date, d.status, d.regularHours, d.overtimeHours);
                                            const cellContent = getCellContent(d, viewMode);
                                            const syncStyle = getSyncStyle(sync, isToday);

                                            const tooltipTitle = sync?.isUnmapped
                                                ? `${d.status} (${day}) - Belum Mapping PTRJ ID`
                                                : `${d.status} (${day})${sync ? ' - ' + sync.status : ''}`;

                                            return (
                                                <Tooltip key={day} title={tooltipTitle} arrow>
                                                    <TableCell align="center" sx={{
                                                        bgcolor: isToday && !sync ? 'rgba(33, 150, 243, 0.05)' : (syncStyle.bgcolor || ui.bg),
                                                        borderRight: isWeeklySplit ? '2px solid #C1C7D0 !important' : '1px solid #F0F0F0',
                                                        position: 'relative',
                                                        p: 0,
                                                        cursor: 'pointer',
                                                        ...syncStyle,
                                                        '&:hover': { filter: 'brightness(0.95)' }
                                                    }} onDoubleClick={() => handleStartEdit(emp)}>
                                                        {cellContent}
                                                        {sync?.displayOverride && (
                                                            <Typography sx={{ position: 'absolute', bottom: 1, left: 0, right: 0, fontSize: '0.55rem', fontWeight: 900, color: sync.displayColor, lineHeight: 1 }}>{sync.displayOverride}</Typography>
                                                        )}
                                                    </TableCell>
                                                </Tooltip>
                                            );
                                        })}
                                    </TableRow>
                                    <TableRow>
                                        <TableCell sx={{ p: 0, border: 'none' }} colSpan={dayNumbers.length + 3}>
                                            <Collapse in={isExpanded || isEditing} timeout="auto" unmountOnExit>
                                                <Box sx={{ p: 2, bgcolor: isEditing ? '#FFF8E1' : '#F4F5F7', borderBottom: '1px solid #DFE1E6' }}>
                                                    {isEditing ? (
                                                        // EDIT MODE FORM
                                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.dark' }}>EDIT DATA: {emp.name} ({emp.id})</Typography>
                                                            <Grid container spacing={2}>
                                                                <Grid item xs={6}>
                                                                    <TextField
                                                                        label="PTRJ Employee ID"
                                                                        value={editValues.ptrjEmployeeID}
                                                                        onChange={(e) => setEditValues({ ...editValues, ptrjEmployeeID: e.target.value })}
                                                                        size="small"
                                                                        fullWidth
                                                                        placeholder="POM00001"
                                                                    />
                                                                </Grid>
                                                                <Grid item xs={6}>
                                                                    <TextField
                                                                        label="Charge Job"
                                                                        value={editValues.chargeJob}
                                                                        onChange={(e) => setEditValues({ ...editValues, chargeJob: e.target.value })}
                                                                        size="small"
                                                                        fullWidth
                                                                        placeholder="TaskCode|Station|Machine|Expense"
                                                                    />
                                                                </Grid>
                                                                <Grid item xs={12}>
                                                                    <FormControlLabel
                                                                        control={
                                                                            <Switch
                                                                                checked={editValues.isKaryawan}
                                                                                onChange={(e) => setEditValues({ ...editValues, isKaryawan: e.target.checked })}
                                                                                color="warning"
                                                                            />
                                                                        }
                                                                        label={editValues.isKaryawan ? "Karyawan Tetap" : "Non-Karyawan (Kontrak)"}
                                                                    />
                                                                </Grid>
                                                                <Grid item xs={12}>
                                                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                                                        <Button
                                                                            variant="contained"
                                                                            color="primary"
                                                                            size="small"
                                                                            onClick={() => handleSaveEdit(emp)}
                                                                            disabled={saving}
                                                                        >
                                                                            {saving ? 'Menyimpan...' : 'Simpan'}
                                                                        </Button>
                                                                        <Button
                                                                            variant="outlined"
                                                                            color="secondary"
                                                                            size="small"
                                                                            onClick={handleCancelEdit}
                                                                            disabled={saving}
                                                                        >
                                                                            Batal
                                                                        </Button>
                                                                    </Box>
                                                                </Grid>
                                                            </Grid>
                                                        </Box>
                                                    ) : (
                                                        // VIEW MODE
                                                        <>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>DETAIL INFO: {emp.name}</Typography>
                                                            <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                                                <Grid item xs={3}><Typography variant="body2" sx={{ fontSize: '0.75rem' }}><b>Charge Job:</b> {emp.chargeJob || '-'}</Typography></Grid>
                                                                <Grid item xs={3}><Typography variant="body2" sx={{ fontSize: '0.75rem' }}><b>Status:</b> {emp.isKaryawan === false ? 'Non-Karyawan' : (emp.isKaryawan ? 'Karyawan Tetap' : 'Belum Diisi')}</Typography></Grid>
                                                            </Grid>
                                                        </>
                                                    )}
                                                </Box>
                                            </Collapse>
                                        </TableCell>
                                    </TableRow>
                                </React.Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(p => ({ ...p, open: false }))}><Alert severity={snackbar.severity}>{snackbar.message}</Alert></Snackbar>
        </Paper>
    );
};

export default AttendanceMatrix;
