import React, { useState, useEffect } from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Tooltip, Typography, Avatar, IconButton, Snackbar, Alert, Checkbox, LinearProgress, Collapse, Grid, Fade, CircularProgress, Chip, TextField, Button, FormControlLabel, Switch } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EventIcon from '@mui/icons-material/Event';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import WarningIcon from '@mui/icons-material/WarningAmber';
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
    setIsEditMode,
    isFiltered = false
}) => {
    const safeData = Array.isArray(data) ? data : [];
    const [editingRow, setEditingRow] = useState(null);
    const [editValues, setEditValues] = useState({ ptrjEmployeeID: '', chargeJob: '', employeeName: '', isKaryawan: true });
    const [saving, setSaving] = useState(false);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const toggleRow = (id) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedRows(newExpanded);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            onToggleSelect(safeData.map(emp => emp.id));
        } else {
            onToggleSelect([]);
        }
    };

    const handleSelectOne = (id) => {
        const newSelected = [...selectedIds];
        const index = newSelected.indexOf(id);
        if (index > -1) {
            newSelected.splice(index, 1);
        } else {
            newSelected.push(id);
        }
        onToggleSelect(newSelected);
    };

    const isAllSelected = safeData.length > 0 && selectedIds.length === safeData.length;
    const isSomeSelected = selectedIds.length > 0 && selectedIds.length < safeData.length;

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

    const todayNum = new Date().getDate();
    const daysMap = safeData[0]?.attendance || {};
    const dayNumbers = Object.keys(daysMap).sort((a, b) => Number(a) - Number(b));

    const getSyncStatus = (ptrjId, dateStr, venusStatus, venusRegularHours = 0, venusOtHours = 0) => {
        if (!compareMode || compareMode === 'off') return null;
        const hasValidPtrjId = ptrjId && ptrjId !== 'N/A' && String(ptrjId).trim() !== '';
        if (!hasValidPtrjId) return { status: 'not_synced', displayOverride: 'N/A', displayColor: '#DE350B', borderWidth: 2, isUnmapped: true, millwareHours: 0 };
        if (!comparisonData) return null;
        const cleanDate = String(dateStr).includes('T') ? dateStr.split('T')[0] : dateStr;
        const key = `${String(ptrjId).trim()}_${cleanDate}`;
        const millwareRecord = comparisonData[key];
        if (['ALFA', 'N/A', 'OFF'].includes(venusStatus?.toUpperCase())) return null;
        const date = new Date(cleanDate);
        const isSunday = date.getDay() === 0;
        const isSaturday = date.getDay() === 6;
        const expectedHours = isSunday ? 0 : (isSaturday ? 5 : 7);
        
        if (compareMode === 'presence') {
            const millwareHours = millwareRecord ? (millwareRecord.normal || 0) : 0;
            const isBelowThreshold = !isSunday && millwareHours > 0 && millwareHours < expectedHours;
            if (!millwareRecord || !millwareRecord.hasRegularRecord) return { status: 'not_synced', displayOverride: `${venusRegularHours}h`, displayColor: '#DE350B', borderWidth: 2, millwareHours: 0 };
            if (!millwareRecord.regularMatched) return { status: 'mismatch', displayOverride: `${venusRegularHours}h|${millwareRecord.normal}h`, displayColor: '#FF991F', borderWidth: 2, millwareHours, isBelowThreshold };
            return { status: 'synced', millwareHours, isBelowThreshold, borderWidth: 1 };
        }
        if (compareMode === 'overtime') {
            const vOT = Number(venusOtHours) || 0;
            const millwareHours = millwareRecord ? (millwareRecord.ot || 0) : 0;
            if (vOT <= 0 && millwareHours <= 0) return null;
            if (!millwareRecord || !millwareRecord.hasOTRecord) return { status: 'not_synced', displayOverride: `${vOT}h`, displayColor: '#DE350B', borderWidth: 2, millwareHours: 0 };
            if (!millwareRecord.otMatched) return { status: 'mismatch', displayOverride: `${vOT}h|${millwareRecord.ot}h`, displayColor: '#FF991F', borderWidth: 2, millwareHours };
            return { status: 'synced', millwareHours, borderWidth: 1 };
        }
        return null;
    };

    const getSyncStyle = (sync, isToday) => {
        if (!sync) return { boxShadow: isToday ? 'inset 0 0 0 1px #2196F3' : 'none' };
        const colors = { synced: '#00875A', not_synced: '#DE350B', mismatch: '#FF991F' };
        const color = colors[sync.status] || '#ccc';
        const shadow = `inset 0 0 0 ${sync.borderWidth || 1}px ${color}${isToday ? ', inset 0 0 0 2px #2196F3' : ''}`;
        if (sync.isUnmapped) return { boxShadow: shadow, bgcolor: 'rgba(222, 53, 11, 0.08)', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(222, 53, 11, 0.05) 2px, rgba(222, 53, 11, 0.05) 4px)' };
        return { boxShadow: shadow, bgcolor: sync.status === 'not_synced' ? 'rgba(222, 53, 11, 0.03)' : (sync.status === 'mismatch' ? 'rgba(255, 153, 31, 0.03)' : 'inherit'), ...(sync.isBelowThreshold ? { bgcolor: 'rgba(255, 153, 31, 0.08)' } : {}) };
    };

    return (
        <Paper elevation={0} sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #DFE1E6', borderRadius: 2, position: 'relative' }}>
            <Fade in={isLoadingComparison}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(15, 32, 64, 0.6)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)', color: '#fff', gap: 2 }}>
                    <CircularProgress color="inherit" size={48} thickness={5} />
                    <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '0.1em' }}>SYNCING WITH MILLWARE...</Typography>
                </Box>
            </Fade>

            {isLoadingComparison && <LinearProgress sx={{ height: 3 }} />}

            <TableContainer sx={{ flexGrow: 1 }}>
                <Table stickyHeader size="small" sx={{ minWidth: 'max-content', '& .MuiTableCell-root': { borderRight: '1px solid #F0F0F0', borderBottom: '1px solid #F0F0F0', py: 0.4, px: 0.5, fontSize: '0.7rem' } }}>
                    <TableHead>
                        <TableRow sx={{ height: 32 }}>
                            <TableCell sx={{ position: 'sticky', left: 0, zIndex: 112, bgcolor: '#F4F5F7', width: 64, p: 0 }} align="center">
                                <Checkbox 
                                    size="small" 
                                    sx={{ p: 0.5 }} 
                                    checked={isAllSelected}
                                    indeterminate={isSomeSelected}
                                    onChange={handleSelectAll}
                                />
                            </TableCell>
                            <TableCell sx={{ position: 'sticky', left: 64, zIndex: 112, bgcolor: '#F4F5F7', width: 180, fontWeight: 800, borderRight: '2px solid #C1C7D0 !important' }}>KARYAWAN</TableCell>
                            <TableCell sx={{ position: 'sticky', left: 244, zIndex: 112, bgcolor: '#F4F5F7', width: 80, fontWeight: 800, borderRight: '2px solid #C1C7D0 !important' }}>ID PTRJ</TableCell>
                            {dayNumbers.map(day => {
                                const d = daysMap[day];
                                const isToday = Number(day) === todayNum;
                                return (
                                    <TableCell key={day} align="center" sx={{ width: 34, bgcolor: isToday ? '#E3F2FD' : '#F4F5F7', borderRight: d?.dayName === 'Min' ? '2px solid #C1C7D0 !important' : '1px solid #F0F0F0', boxShadow: isToday ? 'inset 0 -2px 0 #2196F3' : 'none', p: 0 }}>
                                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: isToday ? '#1976D2' : 'inherit', lineHeight: 1 }}>{day}</Typography>
                                        <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, opacity: 0.6, lineHeight: 1 }}>{d?.dayName?.substring(0, 2).toUpperCase()}</Typography>
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {safeData.map((emp) => {
                            let matchCount = 0;
                            let totalJamMatch = 0;
                            let missRegularCount = 0;
                            let missOTHours = 0;

                            if (emp.attendance) {
                                Object.values(emp.attendance).forEach(d => {
                                    if (d && d.status) {
                                        matchCount++;
                                        totalJamMatch += (Number(d.overtimeHours) || 0);

                                        // Calculate MISS counts when comparison mode is active
                                        if (compareMode && compareMode !== 'off') {
                                            const syncPres = getSyncStatus(emp.ptrjEmployeeID, d.date, d.status, d.regularHours, 0);
                                            const syncOT = getSyncStatus(emp.ptrjEmployeeID, d.date, d.status, 0, d.overtimeHours);

                                            // Presence MISS: status not_synced or mismatch
                                            if (syncPres && (syncPres.status === 'not_synced' || syncPres.status === 'mismatch')) {
                                                missRegularCount++;
                                            }

                                            // OT MISS: has OT in Venus but missing/mismatched in Millware
                                            if (syncOT && (syncOT.status === 'not_synced' || syncOT.status === 'mismatch')) {
                                                const vOT = Number(d.overtimeHours) || 0;
                                                if (vOT > 0) {
                                                    missOTHours += vOT;
                                                }
                                            }
                                        }
                                    }
                                });
                            }

                            const isSelected = selectedIds.includes(emp.id);

                            return (
                                <React.Fragment key={emp.id}>
                                    <TableRow hover selected={isSelected} sx={{ height: 32, bgcolor: editingRow === emp.id ? '#FFF9C4' : 'inherit' }}>
                                        <TableCell sx={{ position: 'sticky', left: 0, zIndex: 101, bgcolor: 'inherit', p: 0, width: 64 }} align="center">
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Checkbox 
                                                    size="small" 
                                                    sx={{ p: 0.5 }} 
                                                    checked={isSelected}
                                                    onChange={() => handleSelectOne(emp.id)}
                                                />
                                                <IconButton size="small" onClick={() => toggleRow(emp.id)} sx={{ p: 0.2 }}>
                                                    {expandedRows.has(emp.id) ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
                                                </IconButton>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ position: 'sticky', left: 64, zIndex: 101, bgcolor: 'inherit', borderRight: '2px solid #F0F0F0 !important' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Avatar sx={{ width: 20, height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: 'primary.light', flexShrink: 0 }}>{emp.name.charAt(0)}</Avatar>
                                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#172B4D', noWrap: true }}>{emp.name}</Typography>
                                                
                                                <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                                    {/* MISS Badges - shown when comparison mode is active */}
                                                    {compareMode && compareMode !== 'off' ? (
                                                        <>
                                                            {missRegularCount > 0 && (
                                                                <Tooltip title={`${missRegularCount} hari absensi MISS`} arrow>
                                                                    <Chip
                                                                        icon={<CancelIcon sx={{ fontSize: '9px !important', color: '#DC2626 !important' }} />}
                                                                        label={`${missRegularCount}`}
                                                                        size="small"
                                                                        sx={{
                                                                            height: 16,
                                                                            fontSize: '0.55rem',
                                                                            fontWeight: 900,
                                                                            bgcolor: '#FEE2E2',
                                                                            color: '#DC2626',
                                                                            border: '1px solid #DC2626',
                                                                            '& .MuiChip-icon': { ml: 0.3, mr: -0.5 },
                                                                            '& .MuiChip-label': { px: 0.5 }
                                                                        }}
                                                                    />
                                                                </Tooltip>
                                                            )}
                                                            {missOTHours > 0 && (
                                                                <Tooltip title={`${missOTHours}h overtime MISS`} arrow>
                                                                    <Chip
                                                                        icon={<AccessTimeIcon sx={{ fontSize: '9px !important', color: '#7C3AED !important' }} />}
                                                                        label={`${missOTHours}h`}
                                                                        size="small"
                                                                        sx={{
                                                                            height: 16,
                                                                            fontSize: '0.55rem',
                                                                            fontWeight: 900,
                                                                            bgcolor: '#F3E8FF',
                                                                            color: '#7C3AED',
                                                                            border: '1px solid #7C3AED',
                                                                            '& .MuiChip-icon': { ml: 0.3, mr: -0.5 },
                                                                            '& .MuiChip-label': { px: 0.5 }
                                                                        }}
                                                                    />
                                                                </Tooltip>
                                                            )}
                                                            {missRegularCount === 0 && missOTHours === 0 && (
                                                                <Tooltip title="Semua sinkron" arrow>
                                                                    <Chip
                                                                        icon={<CheckCircleIcon sx={{ fontSize: '10px !important', color: '#059669 !important' }} />}
                                                                        label="OK"
                                                                        size="small"
                                                                        sx={{
                                                                            height: 16,
                                                                            fontSize: '0.55rem',
                                                                            fontWeight: 900,
                                                                            bgcolor: '#D1FAE5',
                                                                            color: '#059669',
                                                                            border: '1px solid #059669',
                                                                            '& .MuiChip-icon': { ml: 0.3, mr: -0.5 },
                                                                            '& .MuiChip-label': { px: 0.5 }
                                                                        }}
                                                                    />
                                                                </Tooltip>
                                                            )}
                                                        </>
                                                    ) : (
                                                        /* Regular display when NOT in compare mode */
                                                        isFiltered ? (
                                                            <>
                                                                <Chip size="small" label={`${matchCount} HARI`} sx={{ height: 16, fontSize: '0.55rem', fontWeight: 900, bgcolor: '#f5f3ff', color: '#7c3aed', border: '1px solid #7c3aed' }} />
                                                                <Chip size="small" label={`${totalJamMatch}h`} sx={{ height: 16, fontSize: '0.55rem', fontWeight: 900, bgcolor: '#7c3aed', color: 'white' }} />
                                                            </>
                                                        ) : (
                                                            <Chip size="small" label={matchCount} sx={{ height: 16, minWidth: 20, fontSize: '0.6rem', fontWeight: 800, bgcolor: '#E8F5E9', color: '#2E7D32' }} />
                                                        )
                                                    )}
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ position: 'sticky', left: 244, zIndex: 101, bgcolor: editingRow === emp.id ? '#FFF8E1' : 'inherit', borderRight: '2px solid #F0F0F0 !important', cursor: 'pointer' }} onClick={() => handleStartEdit(emp)}>
                                            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: emp.ptrjEmployeeID ? 'secondary.main' : 'text.disabled' }}>{emp.ptrjEmployeeID || 'N/A'}</Typography>
                                        </TableCell>

                                        {dayNumbers.map(day => {
                                            const d = emp.attendance?.[day];
                                            if (!d) return <TableCell key={day} sx={{ bgcolor: isFiltered ? '#f8fafc' : 'inherit' }} />;
                                            const ui = getStatusUI(d.status);
                                            const sync = getSyncStatus(emp.ptrjEmployeeID, d.date, d.status, d.regularHours, d.overtimeHours);
                                            const syncStyle = getSyncStyle(sync, Number(day) === todayNum);
                                            return (
                                                <Tooltip key={day} title={`${d.status} (${day})`} arrow>
                                                    <TableCell align="center" sx={{ bgcolor: syncStyle.bgcolor || ui.bg, borderRight: d?.dayName === 'Min' ? '2px solid #C1C7D0 !important' : '1px solid #F0F0F0', position: 'relative', p: 0, ...syncStyle }}>
                                                        {/* Small Millware Hours Indicator (Top Right) */}
                                                        {sync && (
                                                            <Typography sx={{ position: 'absolute', top: 0.5, right: 1, fontSize: '0.45rem', fontWeight: 900, color: sync.status === 'synced' ? '#00875A' : '#DE350B', lineHeight: 1, zIndex: 1 }}>
                                                                {sync.millwareHours}h
                                                            </Typography>
                                                        )}
                                                        {getCellContent(d, viewMode)}
                                                        {sync?.displayOverride && <Typography sx={{ position: 'absolute', bottom: 1, left: 0, right: 0, fontSize: '0.55rem', fontWeight: 900, color: sync.displayColor, lineHeight: 1 }}>{sync.displayOverride}</Typography>}
                                                    </TableCell>
                                                </Tooltip>
                                            );
                                        })}
                                    </TableRow>

                                    {/* Expanded Detail / Edit Row */}
                                    <TableRow sx={{ display: expandedRows.has(emp.id) ? 'table-row' : 'none', bgcolor: '#fbfbfb' }}>
                                        <TableCell colSpan={dayNumbers.length + 3} sx={{ p: 0, borderBottom: '2px solid #ddd' }}>
                                            <Collapse in={expandedRows.has(emp.id)} timeout="auto">
                                                <Box sx={{ p: 2, borderLeft: '4px solid #7c3aed' }}>
                                                    <Grid container spacing={3} alignItems="flex-end">
                                                        <Grid item xs={12} md={3}>
                                                            <TextField
                                                                fullWidth
                                                                label="Nama Karyawan"
                                                                size="small"
                                                                value={editingRow === emp.id ? editValues.employeeName : emp.name}
                                                                onChange={(e) => setEditValues({ ...editValues, employeeName: e.target.value })}
                                                                disabled={editingRow !== emp.id}
                                                            />
                                                        </Grid>
                                                        <Grid item xs={12} md={2}>
                                                            <TextField
                                                                fullWidth
                                                                label="ID PTRJ"
                                                                size="small"
                                                                value={editingRow === emp.id ? editValues.ptrjEmployeeID : emp.ptrjEmployeeID}
                                                                onChange={(e) => setEditValues({ ...editValues, ptrjEmployeeID: e.target.value })}
                                                                disabled={editingRow !== emp.id}
                                                                helperText="ID di Millware"
                                                            />
                                                        </Grid>
                                                        <Grid item xs={12} md={2}>
                                                            <TextField
                                                                fullWidth
                                                                label="Charge Job"
                                                                size="small"
                                                                value={editingRow === emp.id ? editValues.chargeJob : emp.chargeJob}
                                                                onChange={(e) => setEditValues({ ...editValues, chargeJob: e.target.value })}
                                                                disabled={editingRow !== emp.id}
                                                                placeholder="Contoh: 101"
                                                            />
                                                        </Grid>
                                                        <Grid item xs={12} md={2}>
                                                            <FormControlLabel
                                                                control={
                                                                    <Switch
                                                                        size="small"
                                                                        checked={editingRow === emp.id ? editValues.isKaryawan : (emp.isKaryawan !== false)}
                                                                        onChange={(e) => setEditValues({ ...editValues, isKaryawan: e.target.checked })}
                                                                        disabled={editingRow !== emp.id}
                                                                    />
                                                                }
                                                                label={<Typography variant="body2">Karyawan (Bukan SKU)</Typography>}
                                                            />
                                                        </Grid>
                                                        <Grid item xs={12} md={3} sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                                            {editingRow === emp.id ? (
                                                                <>
                                                                    <Button variant="outlined" size="small" onClick={handleCancelEdit}>Batal</Button>
                                                                    <Button 
                                                                        variant="contained" 
                                                                        size="small" 
                                                                        color="primary" 
                                                                        onClick={() => handleSaveEdit(emp)}
                                                                        disabled={saving}
                                                                        startIcon={saving && <CircularProgress size={14} color="inherit" />}
                                                                    >
                                                                        Simpan
                                                                    </Button>
                                                                </>
                                                            ) : (
                                                                <Button variant="outlined" size="small" onClick={() => handleStartEdit(emp)}>Edit Profile</Button>
                                                            )}
                                                        </Grid>
                                                    </Grid>
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
