import React, { useState } from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Tooltip, Typography, Chip, Avatar, Switch, FormControlLabel, TextField, IconButton, Snackbar, Alert, Checkbox } from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircle';
import PersonIcon from '@mui/icons-material/Person';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import SyncIcon from '@mui/icons-material/Sync';
import SyncDisabledIcon from '@mui/icons-material/SyncDisabled';
import WarningIcon from '@mui/icons-material/Warning';
import { updateEmployeeMill } from '../services/api';

const AttendanceMatrix = ({ data = [], viewMode = 'attendance', onDataUpdate, selectedIds = [], onToggleSelect, compareMode = 'off', comparisonData = null }) => {
    const safeData = Array.isArray(data) ? data : [];
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingRow, setEditingRow] = useState(null);
    const [editValues, setEditValues] = useState({ ptrjEmployeeID: '', chargeJob: '', employeeName: '', isKaryawan: true });
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const handleStartEdit = (emp) => { setEditingRow(emp.id); setEditValues({ ptrjEmployeeID: emp.ptrjEmployeeID || '', chargeJob: emp.chargeJob || '', employeeName: emp.name || '', isKaryawan: emp.isKaryawan !== false }); };
    const handleCancelEdit = () => { setEditingRow(null); setEditValues({ ptrjEmployeeID: '', chargeJob: '', employeeName: '', isKaryawan: true }); };
    const handleSaveEdit = async (emp) => {
        setSaving(true);
        try {
            const result = await updateEmployeeMill(emp.id, { ptrj_employee_id: editValues.ptrjEmployeeID, charge_job: editValues.chargeJob, employee_name: editValues.employeeName, is_karyawan: editValues.isKaryawan });
            if (result.success) {
                setSnackbar({ open: true, message: 'Data tersimpan!', severity: 'success' });
                setEditingRow(null);
                // Update local state without full refresh - call parent with updated employee info
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

    const handleSelectAll = (e) => { if (onToggleSelect) onToggleSelect(e.target.checked ? safeData.map(d => d.id) : []); };
    const handleSelectRow = (id) => { if (onToggleSelect) onToggleSelect(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]); };

    if (safeData.length === 0) return <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Typography color="text.secondary">Pilih Periode untuk menampilkan data</Typography></Box>;

    const daysMap = safeData[0]?.attendance || {};
    const dayNumbers = Object.keys(daysMap).sort((a, b) => Number(a) - Number(b));

    const getStatusColor = (s) => {
        const st = (s || '').toUpperCase();
        if (st === 'HADIR') return { bg: '#ecfdf5', text: '#059669', label: 'H' };
        if (st === 'ALFA') return { bg: '#7f1d1d', text: '#fff', label: 'A' };
        if (st === 'OFF') return { bg: '#f1f5f9', text: '#64748b', label: 'OFF' };
        if (['CT', 'CUTI', 'I', 'IZIN'].includes(st)) return { bg: '#eff6ff', text: '#1e40af', label: st.substring(0, 2) };
        if (['S', 'SAKIT', 'SD'].includes(st)) return { bg: '#fee2e2', text: '#b91c1c', label: 'S' };
        return { bg: '#fff', text: '#1e293b', label: s };
    };

    // Get sync status for a cell (compareMode)
    // Simple comparison: if Venus shows "Hadir" and record exists in Millware for that date = SYNCED
    // Get sync status for a cell (compareMode)
    const getSyncStatus = (ptrjId, dateStr, venusStatus, venusOtHours = 0) => {
        if (!compareMode || compareMode === 'off' || !comparisonData || !ptrjId || ptrjId === 'N/A') {
            return null;
        }

        const key = `${ptrjId}_${dateStr}`;
        const millwareRecord = comparisonData[key];

        // --- PRESENCE MODE (OT=0) ---
        if (compareMode === 'presence') {
            // Skip non-working statuses
            const skipStatuses = ['ALFA', 'OFF', 'N/A'];
            if (skipStatuses.includes(venusStatus?.toUpperCase())) {
                return null;
            }

            if (!millwareRecord) {
                return {
                    status: 'not_synced',
                    icon: <SyncDisabledIcon sx={{ fontSize: 10, color: '#dc2626' }} />,
                    tooltip: `❌ Belum absen (Normal) di Millware`
                };
            }
            return {
                status: 'synced',
                icon: <SyncIcon sx={{ fontSize: 10, color: '#16a34a' }} />,
                tooltip: `✓ Tersinkron (${millwareRecord.hours}h Normal)`
            };
        }

        // --- OVERTIME MODE (OT=1) ---
        if (compareMode === 'overtime') {
            // Only check if there is OT in Venus
            if (venusOtHours <= 0) return null;

            if (!millwareRecord) {
                return {
                    status: 'not_synced',
                    icon: <SyncDisabledIcon sx={{ fontSize: 10, color: '#dc2626' }} />,
                    tooltip: `❌ Lembur ${venusOtHours}h belum masuk Millware`
                };
            }

            // Compare OT hours
            const diff = Math.abs(millwareRecord.hours - venusOtHours);
            if (diff < 0.1) {
                return {
                    status: 'synced',
                    icon: <SyncIcon sx={{ fontSize: 10, color: '#16a34a' }} />,
                    tooltip: `✓ Lembur tersinkron (${millwareRecord.hours}h)`
                };
            } else {
                return {
                    status: 'mismatch',
                    icon: <WarningIcon sx={{ fontSize: 10, color: '#d97706' }} />,
                    tooltip: `⚠ Lembur beda: Venus=${venusOtHours}h vs Millware=${millwareRecord.hours}h`
                };
            }
        }

        return null;
    };

    return (
        <Paper elevation={0} sx={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 0.5, borderBottom: '1px solid #e5e7eb', bgcolor: isEditMode ? '#fef3c7' : '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
                <FormControlLabel control={<Switch checked={isEditMode} onChange={(e) => { setIsEditMode(e.target.checked); if (!e.target.checked) handleCancelEdit(); }} color="warning" size="small" />} label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><EditIcon sx={{ fontSize: 14, color: isEditMode ? '#d97706' : '#9ca3af' }} /><Typography variant="caption" sx={{ fontWeight: isEditMode ? 600 : 400, color: isEditMode ? '#92400e' : '#6b7280' }}>Edit</Typography></Box>} sx={{ m: 0 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {selectedIds.length > 0 && <Typography variant="caption" sx={{ color: '#059669', fontWeight: 600 }}>{selectedIds.length} Terpilih</Typography>}
                    {isEditMode && <Typography variant="caption" sx={{ color: '#92400e', fontSize: '0.7rem' }}>Klik baris untuk edit</Typography>}
                </Box>
            </Box>
            <TableContainer sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'auto' }}>
                <Table stickyHeader size="small" sx={{ minWidth: 'max-content', '& .MuiTableCell-root': { borderRight: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', py: 0.5, px: 0.75 } }}>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox" sx={{ position: 'sticky', left: 0, zIndex: 111, bgcolor: '#f9fafb', width: 40 }}><Checkbox indeterminate={selectedIds.length > 0 && selectedIds.length < safeData.length} checked={safeData.length > 0 && selectedIds.length === safeData.length} onChange={handleSelectAll} size="small" /></TableCell>
                            <TableCell sx={{ position: 'sticky', left: 40, zIndex: 111, bgcolor: '#f9fafb', width: 200, fontWeight: 700, fontSize: '0.7rem', boxShadow: '2px 0 5px rgba(0,0,0,0.08)' }}><PersonIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />NAMA</TableCell>
                            <TableCell sx={{ bgcolor: isEditMode ? '#fef3c7' : '#f9fafb', width: 100, fontWeight: 700, fontSize: '0.7rem' }}>PTRJ ID</TableCell>

                            {/* Single Charge Job Column */}
                            <TableCell sx={{ bgcolor: isEditMode ? '#fef3c7' : '#fef8ed', minWidth: 200, fontWeight: 700, fontSize: '0.7rem', color: '#92400e', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                CHARGE JOB
                            </TableCell>

                            {/* Status Karyawan Column - only visible in edit mode */}
                            {isEditMode && (
                                <TableCell sx={{ bgcolor: '#fef3c7', width: 80, fontWeight: 700, fontSize: '0.7rem', textAlign: 'center' }}>
                                    is_karyawan
                                </TableCell>
                            )}

                            {dayNumbers.map(day => {
                                const d = daysMap[day];
                                const isHoliday = d?.isHoliday;
                                const isSunday = d?.isSunday;
                                const bgColor = isHoliday ? '#fecaca' : isSunday ? '#fff1f2' : '#fff';
                                const textColor = isHoliday ? '#991b1b' : isSunday ? '#e11d48' : '#111';
                                return (
                                    <TableCell key={day} align="center" sx={{ width: 40, bgcolor: bgColor, color: textColor, fontWeight: 600, fontSize: '0.7rem' }}>
                                        <Tooltip title={d?.holidayName || ''} arrow disableHoverListener={!isHoliday}>
                                            <div>
                                                <div>{day}</div>
                                                <div style={{ fontSize: '0.6rem', opacity: 0.7 }}>{d?.dayName?.substring(0, 2)}</div>
                                            </div>
                                        </Tooltip>
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {safeData.map((emp, idx) => {
                            const isEven = idx % 2 === 0;
                            const isEditing = editingRow === emp.id;
                            const isSelected = selectedIds.includes(emp.id);

                            // Use chargeJob as-is (no splitting)
                            const chargeJob = emp.chargeJob || '-';

                            return (
                                <TableRow key={emp.id} hover selected={isSelected} onClick={() => { if (isEditMode && !isEditing) handleStartEdit(emp); else if (!isEditMode) handleSelectRow(emp.id); }} sx={{ bgcolor: isEditing ? '#fef3c7' : isSelected ? '#eff6ff' : isEven ? '#fff' : '#fafbfc', cursor: 'pointer' }}>
                                    <TableCell padding="checkbox" sx={{ position: 'sticky', left: 0, zIndex: 101, bgcolor: isEditing ? '#fef3c7' : isSelected ? '#eff6ff' : isEven ? '#fff' : '#fafbfc' }} onClick={(e) => { e.stopPropagation(); handleSelectRow(emp.id); }}><Checkbox checked={isSelected} size="small" /></TableCell>
                                    <TableCell sx={{ position: 'sticky', left: 40, zIndex: 101, bgcolor: isEditing ? '#fef3c7' : isSelected ? '#eff6ff' : isEven ? '#fff' : '#fafbfc', boxShadow: '2px 0 5px rgba(0,0,0,0.05)', fontWeight: 500, minWidth: 200 }} onClick={(e) => isEditing && e.stopPropagation()}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem', bgcolor: isEditing ? '#d97706' : '#7c3aed' }}>{(isEditing ? editValues.employeeName : emp.name)?.charAt(0)}</Avatar>
                                            {isEditing ? (
                                                <TextField
                                                    size="small"
                                                    value={editValues.employeeName}
                                                    onChange={(e) => setEditValues(p => ({ ...p, employeeName: e.target.value }))}
                                                    sx={{ flex: 1, '& input': { py: 0.5, fontSize: '0.75rem' } }}
                                                    placeholder="Nama Karyawan"
                                                />
                                            ) : (
                                                <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem' }}>{emp.name}</Typography>
                                            )}
                                            {isEditing && <Box sx={{ ml: 'auto', display: 'flex' }}><IconButton size="small" color="success" onClick={(e) => { e.stopPropagation(); handleSaveEdit(emp); }} disabled={saving}><SaveIcon fontSize="small" /></IconButton><IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}><CloseIcon fontSize="small" /></IconButton></Box>}
                                        </Box>
                                    </TableCell>
                                    <TableCell onClick={(e) => isEditing && e.stopPropagation()}>{isEditing ? <TextField size="small" value={editValues.ptrjEmployeeID} onChange={(e) => setEditValues(p => ({ ...p, ptrjEmployeeID: e.target.value }))} sx={{ width: '100%', '& input': { py: 0.5, fontSize: '0.75rem' } }} /> : (emp.ptrjEmployeeID || '-')}</TableCell>

                                    {/* Single Charge Job Cell - show as-is without splitting */}
                                    <TableCell onClick={(e) => isEditing && e.stopPropagation()} sx={{ whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: 300 }}>
                                        {isEditing ? (
                                            <TextField
                                                size="small"
                                                value={editValues.chargeJob}
                                                onChange={(e) => setEditValues(p => ({ ...p, chargeJob: e.target.value }))}
                                                sx={{ width: '100%', '& input': { py: 0.5, fontSize: '0.7rem' } }}
                                                placeholder="Charge Job"
                                            />
                                        ) : (
                                            <Tooltip title={chargeJob}>
                                                <Typography variant="body2" sx={{ fontSize: '0.7rem', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                                    {chargeJob}
                                                </Typography>
                                            </Tooltip>
                                        )}
                                    </TableCell>

                                    {/* Status Karyawan Cell - only visible in edit mode */}
                                    {isEditMode && (
                                        <TableCell align="center" onClick={(e) => e.stopPropagation()} sx={{ bgcolor: isEditing ? '#fef3c7' : 'transparent' }}>
                                            <Checkbox
                                                size="small"
                                                checked={isEditing ? editValues.isKaryawan : (emp.isKaryawan !== false)}
                                                onChange={async (e) => {
                                                    e.stopPropagation();
                                                    const newValue = e.target.checked;
                                                    if (isEditing) {
                                                        // If editing, update the edit state
                                                        setEditValues(p => ({ ...p, isKaryawan: newValue }));
                                                    } else {
                                                        // If not editing, save directly
                                                        try {
                                                            const result = await updateEmployeeMill(emp.id, { is_karyawan: newValue });
                                                            if (result.success) {
                                                                setSnackbar({ open: true, message: 'Status tersimpan!', severity: 'success' });
                                                                if (onDataUpdate) {
                                                                    onDataUpdate({
                                                                        type: 'update_employee',
                                                                        id: emp.id,
                                                                        updates: { isKaryawan: newValue }
                                                                    });
                                                                }
                                                            } else {
                                                                setSnackbar({ open: true, message: result.error || 'Gagal', severity: 'error' });
                                                            }
                                                        } catch (err) {
                                                            setSnackbar({ open: true, message: err.message, severity: 'error' });
                                                        }
                                                    }
                                                }}
                                                color="success"
                                            />
                                        </TableCell>
                                    )}

                                    {dayNumbers.map(day => {
                                        const d = emp.attendance?.[day];
                                        if (!d) return <TableCell key={day} />;
                                        const st = getStatusColor(d.status);

                                        let cellContent;
                                        if (viewMode === 'overtime') {
                                            const ot = d.overtimeHours || 0;
                                            cellContent = ot > 0 ? <span style={{ color: '#c2410c', fontWeight: 700 }}>{ot}</span> : '-';
                                        } else if (viewMode === 'detail') {
                                            // WORK_HOURS Constants (Must match backend)
                                            const WORK_HOURS = { NORMAL: 7, SHORT: 5 };
                                            
                                            // Calculate regular hours based on day: Saturday = 5h, others = 7h
                                            const date = new Date(d.date);
                                            const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday
                                            const isShortDay = dayOfWeek === 6;

                                            // If Hadir or Partial In, use calculated hours; otherwise use 0
                                            let reg = 0;
                                            if (['Hadir', 'Partial In', 'Partial Out'].includes(d.status)) {
                                                reg = d.regularHours > 0 ? d.regularHours : (dayOfWeek === 0 ? 0 : (isShortDay ? WORK_HOURS.SHORT : WORK_HOURS.NORMAL));
                                            }
                                            const ot = d.overtimeHours || 0;

                                            if (['Hadir', 'Partial In', 'Partial Out'].includes(d.status)) {
                                                cellContent = <span>{reg}{ot > 0 ? <span style={{ color: '#c2410c' }}>+{ot}</span> : ''}</span>;
                                            } else {
                                                cellContent = st.label; // Show status label for non-hadir
                                            }
                                        } else {
                                            // Default attendance view - checkmark for Hadir
                                            cellContent = d.status === 'Hadir' ? <CheckIcon sx={{ fontSize: 14, color: '#059669' }} /> : st.label;
                                        }

                                        const cellBg = d.isHoliday ? '#fecaca' : d.isSunday ? '#fff1f2' : st.bg;

                                        // Get sync status if in compare mode
                                        const syncStatus = getSyncStatus(emp.ptrjEmployeeID, d.date, d.status, d.overtimeHours || 0);

                                        // Determine border style based on sync status
                                        let borderStyle = {};
                                        if (syncStatus) {
                                            if (syncStatus.status === 'synced') {
                                                borderStyle = { boxShadow: 'inset 0 0 0 2px #16a34a' };
                                            } else if (syncStatus.status === 'not_synced') {
                                                borderStyle = { boxShadow: 'inset 0 0 0 2px #dc2626' };
                                            } else if (syncStatus.status === 'mismatch') {
                                                borderStyle = { boxShadow: 'inset 0 0 0 2px #d97706' };
                                            }
                                        }

                                        return (
                                            <Tooltip key={day} title={syncStatus?.tooltip || ''} arrow disableHoverListener={!syncStatus}>
                                                <TableCell
                                                    align="center"
                                                    sx={{
                                                        bgcolor: cellBg,
                                                        color: st.text,
                                                        fontWeight: 600,
                                                        fontSize: '0.7rem',
                                                        position: 'relative',
                                                        ...borderStyle
                                                    }}
                                                >
                                                    {cellContent}
                                                    {syncStatus && (
                                                        <Box sx={{
                                                            position: 'absolute',
                                                            top: 1,
                                                            right: 1,
                                                            lineHeight: 1
                                                        }}>
                                                            {syncStatus.icon}
                                                        </Box>
                                                    )}
                                                </TableCell>
                                            </Tooltip>
                                        );
                                    })}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(p => ({ ...p, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={snackbar.severity}>{snackbar.message}</Alert></Snackbar>
        </Paper>
    );
};

export default AttendanceMatrix;
