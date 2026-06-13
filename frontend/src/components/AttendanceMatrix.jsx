import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { SkeletonTable } from '../utils/SkeletonTable';

const INITIAL_ROW_COUNT = 50;

// ============================================================
// PROGRESSIVE TOOLTIP DESIGN SYSTEM
// Professional light-themed tooltips with structured layout
// ============================================================

// Shared tooltip styles - applied via slotProps.tooltip
const TOOLTIP_PAPER_PROPS = {
    sx: {
        bgcolor: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(12px)',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
        maxWidth: 260,
        p: 0,
        overflow: 'hidden',
    }
};

const TOOLTIP_ARROW_STYLES = {
    '& .MuiTooltip-tooltipArrow': {
        color: 'rgba(255, 255, 255, 0.98)',
    },
    '& .MuiTooltip-arrow': {
        color: 'rgba(255, 255, 255, 0.98)',
    }
};

// Section header within tooltip
const TooltipSection = ({ children, sx }) => (
    <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', ...sx }}>
        {children}
    </Box>
);

// Data row within tooltip
const TooltipRow = ({ icon, label, value, valueColor, highlight, isWarning, isSuccess }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.4, bgcolor: highlight ? 'rgba(251, 191, 36, 0.08)' : 'transparent' }}>
        {icon && <Box sx={{ color: valueColor || 'text.secondary', display: 'flex', alignItems: 'center', minWidth: 14 }}>{icon}</Box>}
        <Typography component="span" sx={{ fontSize: '0.72rem', color: 'text.secondary', minWidth: 80 }}>{label}</Typography>
        <Typography component="span" sx={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: isWarning ? '#DC2626' : isSuccess ? '#059669' : valueColor || 'text.primary',
            ml: 'auto'
        }}>{value}</Typography>
    </Box>
);

// Footer with employee/date info
const TooltipFooter = ({ children }) => (
    <Box sx={{ px: 1.5, py: 0.5, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
        {children}
    </Box>
);

// Generic customizable tooltip wrapper
const ProTooltip = ({ title, children, placement = 'top', ...props }) => (
    <Tooltip
        title={title}
        arrow
        placement={placement}
        slotProps={{
            tooltip: TOOLTIP_PAPER_PROPS,
            popper: { modifiers: [{ name: 'offset', options: { offset: [0, -6] } }] }
        }}
        sx={{ '& .MuiTooltip-tooltip': { bgcolor: 'transparent' }, ...TOOLTIP_ARROW_STYLES }}
        {...props}
    >
        {children}
    </Tooltip>
);

const AttendanceMatrix = ({
    data = [],
    viewMode = 'attendance',
    cellFilter = null,
    onDataUpdate,
    selectedIds = [],
    onToggleSelect,
    compareMode = 'off',
    comparisonData = null,
    isLoadingComparison = false,
    isEditMode = false,
    setIsEditMode,
    isFiltered = false,
    isLoading = false
}) => {
    const [editingRow, setEditingRow] = useState(null);
    const [editValues, setEditValues] = useState({ ptrjEmployeeID: '', chargeJob: '', employeeName: '', isKaryawan: true });
    const [saving, setSaving] = useState(false);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [showAllRows, setShowAllRows] = useState(false);

    const toggleRow = (id) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedRows(newExpanded);
    };

    useEffect(() => {
        const styleId = 'attendance-matrix-pulse-animation';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.1); }
                }
                @keyframes highlight-pulse {
                    0%, 100% { box-shadow: inset 0 0 0 2px #F59E0B; }
                    50% { box-shadow: inset 0 0 0 3px #FCD34D; }
                }
            `;
            document.head.appendChild(style);
        }
        return () => {
            const element = document.getElementById(styleId);
            if (element) element.remove();
        };
    }, []);

    const safeData = Array.isArray(data) ? data : [];
    const visibleData = useMemo(
        () => showAllRows ? safeData : safeData.slice(0, INITIAL_ROW_COUNT),
        [safeData, showAllRows]
    );
    const todayNum = new Date().getDate();
    const daysMap = safeData[0]?.attendance || {};
    const dayNumbers = Object.keys(daysMap).sort((a, b) => Number(a) - Number(b));
    const dayCellWidth = viewMode === 'comparison' ? 66 : 34;

    if (isLoading) {
        return (
            <Paper elevation={0} sx={{ height: '100%', p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                    <CircularProgress />
                </Box>
            </Paper>
        );
    }

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

    // Extract station from chargeJob (e.g., "101/Station A/Machine 1" -> "Station A")
    const getStation = (chargeJob) => {
        if (!chargeJob || chargeJob === '-' || chargeJob === 'N/A') return null;
        const parts = chargeJob.split('/');
        if (parts.length > 1) {
            return parts[1]?.trim() || null;
        }
        const firstPart = parts[0]?.trim() || '';
        const match = firstPart.match(/^\([^)]+\)\s*(.+)$/);
        if (match && match[1]) return match[1].trim();
        return firstPart || null;
    };

    // Calculate total overtime for an employee
    const calculateOTSummary = (emp) => {
        if (!emp.attendance) return { days: 0, hours: 0, standardHours: 0, realHours: 0 };
        let otDays = 0;
        let totalHours = 0;
        let standardHours = 0;
        let realHours = 0;

        Object.values(emp.attendance).forEach(d => {
            const otHours = Number(d.overtimeHours) || 0;
            const regHours = Number(d.regularHours) || 0;
            if (otHours > 0) {
                otDays++;
                totalHours += otHours;
                // Standard OT is typically calculated after 7 regular hours
                const stdOT = Math.max(0, otHours - (regHours > 7 ? regHours - 7 : 0));
                standardHours += stdOT;
                realHours += otHours;
            }
        });

        return { days: otDays, hours: totalHours, standardHours, realHours };
    };

    // Calculate presence summary for an employee
    const calculatePresenceSummary = (emp) => {
        if (!emp.attendance) return { days: 0, standardHours: 0, realHours: 0 };
        let presentDays = 0;
        let standardHours = 0;
        let realHours = 0;

        Object.values(emp.attendance).forEach(d => {
            const regHours = Number(d.regularHours) || 0;
            if (d.status === 'HADIR' && regHours > 0) {
                presentDays++;
                realHours += regHours;
                // Standard presence: 7 hours for weekdays/Sunday, 5 for Saturday
                const date = new Date(d.date);
                const isSunday = date.getDay() === 0;
                const isSaturday = date.getDay() === 6;
                const stdHours = isSaturday ? 5 : 7;  // Sunday = 7, Saturday = 5, Weekday = 7
                standardHours += stdHours;
            }
        });

        return { days: presentDays, standardHours, realHours };
    };

    // Check if a cell matches the filter condition
    const cellMatchesFilter = (d, filter) => {
        if (!filter || !filter.enabled || !d) return true;
        
        const regHours = Number(d.regularHours) || 0;
        const otHours = Number(d.overtimeHours) || 0;
        const isSunday = new Date(d.date).getDay() === 0;
        const isSaturday = new Date(d.date).getDay() === 6;
        const stdPresence = isSaturday ? 5 : 7;  // Sunday = 7, Saturday = 5, Weekday = 7
        
        switch (filter.condition) {
            case 'ot_gt':
                return otHours > filter.value;
            case 'ot_gte':
                return otHours >= filter.value;
            case 'ot_lt':
                return otHours > 0 && otHours < filter.value;
            case 'ot_eq':
                return otHours === filter.value;
            case 'hours_lt':
                return regHours > 0 && regHours < stdPresence;
            case 'hours_gt':
                return regHours > stdPresence;
            case 'ot_only':
                return otHours > 0;
            case 'absence':
                return d.status === 'ALFA';
            default:
                return true;
        }
    };

    const getComparisonRecord = (ptrjId, dateStr) => {
        if (!comparisonData) return null;
        const hasValidPtrjId = ptrjId && ptrjId !== 'N/A' && String(ptrjId).trim() !== '';
        if (!hasValidPtrjId || !dateStr) return null;
        const cleanDate = String(dateStr).includes('T') ? dateStr.split('T')[0] : dateStr;
        return comparisonData[`${String(ptrjId).trim()}_${cleanDate}`] || null;
    };

    const formatHour = (value) => {
        const number = Number(value) || 0;
        return Number.isInteger(number) ? String(number) : number.toFixed(2);
    };

    const getCellContent = (d, viewMode, empName = '', dayNum = '', comparisonRecord = null, comparisonLoaded = false) => {
        if (!d) return null;
        
        const isSunday = new Date(d.date).getDay() === 0;
        const isSaturday = new Date(d.date).getDay() === 6;
        const stdPresence = isSaturday ? 5 : 7;  // Sunday = 7, Saturday = 5, Weekday = 7
        const regHours = Number(d.regularHours) || 0;
        const otHours = Number(d.overtimeHours) || 0;
        const totalHours = regHours + otHours;
        const stdOT = Math.max(0, totalHours - stdPresence);
        const isBelowStandard = !isSunday && regHours > 0 && regHours < stdPresence;
        
        // Helper to render warning icon for below standard hours
        const renderWarning = () => {
            if (isBelowStandard) {
                return (
                    <ProTooltip
                        title={
                            <Box>
                                <TooltipSection sx={{ bgcolor: '#FEF2F2', borderColor: '#FECACA' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <WarningIcon sx={{ fontSize: 14, color: '#DC2626' }} />
                                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#DC2626' }}>REAL HOURS KURANG</Typography>
                                    </Box>
                                </TooltipSection>
                                <TooltipRow label="Real Hours" value={`${regHours.toFixed(2)}h`} valueColor="#DC2626" />
                                <TooltipRow label="Std Hours" value={`${stdPresence.toFixed(2)}h`} valueColor="#374151" />
                                <TooltipRow label="Selisih" value={`${(stdPresence - regHours).toFixed(2)}h`} valueColor="#DC2626" highlight />
                                <TooltipFooter>
                                    <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', fontStyle: 'italic' }}>
                                        Real hours di bawah std hours
                                    </Typography>
                                </TooltipFooter>
                            </Box>
                        }
                        placement="top"
                    >
                        <WarningIcon sx={{ fontSize: 12, color: '#DC2626', position: 'absolute', top: 1, left: 1, animation: 'pulse 1.5s infinite' }} />
                    </ProTooltip>
                );
            }
            return null;
        };

        // Helper to render OT warning (if OT hours are recorded but total is still below standard)
        const renderOTWarning = () => {
            const hasOTButBelowStandard = otHours > 0 && totalHours < stdPresence && !isSunday;
            if (hasOTButBelowStandard) {
                return (
                    <ProTooltip
                        title={
                            <Box>
                                <TooltipSection sx={{ bgcolor: '#FFF7ED', borderColor: '#FED7AA' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <WarningIcon sx={{ fontSize: 14, color: '#EA580C' }} />
                                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#EA580C' }}>LEMBUR TIDAK CUKUP</Typography>
                                    </Box>
                                </TooltipSection>
                                <TooltipRow label="Real Hours" value={`${regHours.toFixed(2)}h`} valueColor="#374151" />
                                <TooltipRow label="SPL" value={`${otHours.toFixed(2)}h`} valueColor="#7C3AED" />
                                <TooltipRow label="Total" value={`${totalHours.toFixed(2)}h`} valueColor="#EA580C" />
                                <TooltipRow label="Std Hours" value={`${stdPresence.toFixed(2)}h`} valueColor="#374151" highlight />
                                <TooltipFooter>
                                    <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', fontStyle: 'italic' }}>
                                        Real + SPL masih di bawah std hours
                                    </Typography>
                                </TooltipFooter>
                            </Box>
                        }
                        placement="top"
                    >
                        <WarningIcon sx={{ fontSize: 12, color: '#EA580C', position: 'absolute', top: 1, right: 1, animation: 'pulse 1.5s infinite' }} />
                    </ProTooltip>
                );
            }
            return null;
        };

        if (viewMode === 'comparison') {
            const statusUpper = (d.status || '').toUpperCase();
            const millwareNormal = comparisonLoaded ? (Number(comparisonRecord?.normal) || 0) : null;
            const millwareOT = comparisonLoaded ? (Number(comparisonRecord?.ot) || 0) : null;
            const regularRecordCount = comparisonLoaded ? (Number(comparisonRecord?.regularRecordCount) || 0) : 0;
            const overtimeRecordCount = comparisonLoaded ? (Number(comparisonRecord?.overtimeRecordCount) || 0) : 0;
            const venusNormal = regHours;
            const venusOT = otHours;
            const needsRegular = comparisonRecord?.needsRegularRecord ?? (d.isSunday === true || d.isHoliday === true || Boolean(d.holidayName) || !['ALFA', 'N/A'].includes(statusUpper));
            const needsOT = venusOT > 0;
            const normalOk = comparisonLoaded && (!needsRegular || (comparisonRecord?.hasRegularRecord === true && (Number(comparisonRecord?.normal) || 0) > 0));
            const otOk = comparisonLoaded && (!needsOT || comparisonRecord?.hasOTRecord === true);
            const allOk = normalOk && otOk;
            const normalColor = !comparisonLoaded ? '#64748B' : (normalOk ? '#059669' : '#DC2626');
            const otColor = !comparisonLoaded ? '#64748B' : (otOk ? '#7C3AED' : '#DC2626');
            const rowBg = !comparisonLoaded ? '#F8FAFC' : (allOk ? '#F0FDF4' : '#FEF2F2');

            return (
                <ProTooltip
                    title={
                        <Box>
                            <TooltipSection sx={{ bgcolor: rowBg, borderColor: allOk ? '#BBF7D0' : '#FECACA' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: comparisonLoaded ? (allOk ? '#059669' : '#DC2626') : '#64748B' }}>
                                        KOMPARASI ABSEN
                                    </Typography>
                                    {comparisonLoaded && !allOk && <WarningIcon sx={{ fontSize: 13, color: '#DC2626' }} />}
                                </Box>
                            </TooltipSection>
                            {!comparisonLoaded ? (
                                <Box sx={{ px: 1.5, py: 1 }}>
                                    <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>
                                        Jalankan CHECK SYNC untuk memuat data Millware.
                                    </Typography>
                                </Box>
                            ) : (
                                <>
                                    <TooltipRow label="Venus Normal" value={`${formatHour(venusNormal)}h`} valueColor="#0F172A" />
                                    <TooltipRow
                                        label="Millware Normal"
                                        value={`${formatHour(millwareNormal)}h`}
                                        valueColor={normalColor}
                                        isWarning={needsRegular && !normalOk}
                                        isSuccess={normalOk}
                                        highlight={needsRegular && !normalOk}
                                    />
                                    <TooltipRow
                                        label="MW OT=0 Rows"
                                        value={`${regularRecordCount}`}
                                        valueColor={normalColor}
                                        isWarning={needsRegular && regularRecordCount <= 0}
                                        isSuccess={regularRecordCount > 0}
                                    />
                                    <TooltipRow label="Venus OT" value={`${formatHour(venusOT)}h`} valueColor="#7C3AED" />
                                    <TooltipRow
                                        label="Millware OT"
                                        value={`${formatHour(millwareOT)}h`}
                                        valueColor={otColor}
                                        isWarning={needsOT && !otOk}
                                        isSuccess={otOk}
                                        highlight={needsOT && !otOk}
                                    />
                                    <TooltipRow
                                        label="MW OT=1 Rows"
                                        value={`${overtimeRecordCount}`}
                                        valueColor={otColor}
                                        isWarning={needsOT && overtimeRecordCount <= 0}
                                        isSuccess={overtimeRecordCount > 0}
                                    />
                                    <Box sx={{ px: 1.5, py: 0.5, bgcolor: allOk ? '#F0FDF4' : '#FEF2F2', borderTop: '1px solid', borderColor: 'divider' }}>
                                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: allOk ? '#059669' : '#DC2626' }}>
                                            {allOk ? 'DATA SUDAH MASUK' : 'ADA DATA BELUM MASUK'}
                                        </Typography>
                                    </Box>
                                </>
                            )}
                            <TooltipFooter>
                                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                                    V = Venus, M = Millware &bull; {empName} &bull; {d.date}
                                </Typography>
                            </TooltipFooter>
                        </Box>
                    }
                    placement="top"
                >
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0.15, px: 0.35, py: 0.25, lineHeight: 1 }}>
                        {!comparisonLoaded ? (
                            <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: '#64748B', textAlign: 'center' }}>CHECK</Typography>
                        ) : (
                            <>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.4 }}>
                                    <Typography sx={{ fontSize: '0.48rem', fontWeight: 900, color: normalColor }}>N</Typography>
                                    <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: normalColor }}>
                                        {formatHour(venusNormal)}/{formatHour(millwareNormal)}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.4 }}>
                                    <Typography sx={{ fontSize: '0.48rem', fontWeight: 900, color: otColor }}>OT</Typography>
                                    <Typography sx={{ fontSize: '0.55rem', fontWeight: 900, color: otColor }}>
                                        {formatHour(venusOT)}/{formatHour(millwareOT)}
                                    </Typography>
                                </Box>
                            </>
                        )}
                    </Box>
                </ProTooltip>
            );
        }

        if (viewMode === 'overtime') {
            if (otHours > 0) {
                const hasNotation = stdOT !== otHours;
                return (
                    <ProTooltip
                        title={
                            <Box>
                                <TooltipSection sx={{ bgcolor: '#F5F3FF', borderColor: '#DDD6FE' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <AccessTimeIcon sx={{ fontSize: 14, color: '#7C3AED' }} />
                                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#7C3AED' }}>SPL</Typography>
                                        {isBelowStandard && (
                                            <WarningIcon sx={{ fontSize: 12, color: '#EA580C', ml: 0.5 }} />
                                        )}
                                    </Box>
                                </TooltipSection>
                                <TooltipRow label="SPL" value={`${otHours.toFixed(2)}h`} valueColor="#7C3AED" />
                                {hasNotation && (
                                    <TooltipRow label="Std SPL" value={`${stdOT.toFixed(2)}h`} valueColor="#6D28D9" />
                                )}
                                <TooltipRow label="Real Hours" value={`${regHours.toFixed(2)}h`} valueColor="#374151" />
                                <TooltipRow label="Total" value={`${totalHours.toFixed(2)}h`} valueColor="#374151" />
                                {isBelowStandard && (
                                    <Box sx={{ px: 1.5, py: 0.5, bgcolor: '#FFF7ED' }}>
                                        <Typography sx={{ fontSize: '0.68rem', color: '#EA580C', fontWeight: 600 }}>
                                            ⚠️ Real ({regHours.toFixed(2)}h) &lt; Std ({stdPresence}h)
                                        </Typography>
                                    </Box>
                                )}
                                <TooltipFooter>
                                    <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                                        {empName} &bull; {d.date} ({d.dayName})
                                    </Typography>
                                </TooltipFooter>
                            </Box>
                        }
                        placement="top"
                    >
                        <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#9C27B0', py: 0.2 }}>
                            {renderWarning()}
                            {renderOTWarning()}
                            <AccessTimeIcon sx={{ fontSize: 12 }} />
                            <Typography sx={{ fontSize: '0.65rem', fontWeight: 800 }}>{otHours.toFixed(2)}h</Typography>
                            {hasNotation && <Typography sx={{ fontSize: '0.5rem', color: '#7B1FA2', fontWeight: 600 }}>std: {stdOT.toFixed(2)}h</Typography>}
                        </Box>
                    </ProTooltip>
                );
            }
            return <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>-</Typography>;
        }
        
        if (viewMode === 'detail') {
            return (
                <ProTooltip
                    title={
                        <Box>
                            <TooltipSection>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>DETAIL ABSEN</Typography>
                                    {isBelowStandard && <WarningIcon sx={{ fontSize: 12, color: '#DC2626' }} />}
                                </Box>
                            </TooltipSection>
                            <TooltipRow label="Real Hours" value={`${regHours.toFixed(2)}h`} valueColor={isBelowStandard ? '#DC2626' : '#374151'} isWarning={isBelowStandard} />
                            {regHours !== stdPresence && stdPresence > 0 && (
                                <TooltipRow
                                    label="Std Hours"
                                    value={`${stdPresence.toFixed(2)}h`}
                                    valueColor="#6B7280"
                                    highlight={isBelowStandard}
                                />
                            )}
                            {otHours > 0 && (
                                <>
                                    <TooltipRow label="SPL" value={`+${otHours.toFixed(2)}h`} valueColor="#7C3AED" />
                                    {stdOT > 0 && (
                                        <TooltipRow label="Std SPL" value={`${stdOT.toFixed(2)}h`} valueColor="#6D28D9" />
                                    )}
                                </>
                            )}
                            <Box sx={{ px: 1.5, py: 0.5, bgcolor: isBelowStandard ? '#FEF2F2' : '#F0FDF4', borderTop: '1px solid', borderColor: 'divider' }}>
                                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: isBelowStandard ? '#DC2626' : '#059669' }}>
                                    TOTAL: {totalHours.toFixed(2)}h
                                    {!isSunday && stdPresence > 0 && (
                                        <Typography component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, ml: 0.5 }}>
                                            {totalHours >= stdPresence ? '✓ Mencapai' : '⚠️ Di bawah'}
                                        </Typography>
                                    )}
                                </Typography>
                            </Box>
                            <TooltipFooter>
                                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                                    {empName} &bull; {d.date} ({d.dayName})
                                </Typography>
                            </TooltipFooter>
                        </Box>
                    }
                    placement="top"
                >
                    <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#172B4D', py: 0.2, fontSize: '0.55rem', lineHeight: 1.1 }}>
                        {renderWarning()}
                        {regHours > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isBelowStandard ? '#DC2626' : '#2E7D32' }}>{regHours.toFixed(2)}h</Typography>
                                {regHours !== stdPresence && stdPresence > 0 && <Typography sx={{ fontSize: '0.5rem', color: isBelowStandard ? '#DC2626' : '#1565C0', fontWeight: 600 }}>std: {stdPresence.toFixed(2)}h</Typography>}
                            </Box>
                        ) : null}
                        {otHours > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <Typography sx={{ fontSize: '0.6rem', color: '#9C27B0', fontWeight: 700 }}>+{otHours.toFixed(2)}h</Typography>
                                {stdOT > 0 && <Typography sx={{ fontSize: '0.45rem', color: '#7B1FA2', fontWeight: 600 }}>std: {stdOT.toFixed(2)}h</Typography>}
                            </Box>
                        ) : null}
                        {regHours === 0 && otHours === 0 ? <Typography sx={{ fontSize: '0.6rem', color: '#757575' }}>-</Typography> : null}
                    </Box>
                </ProTooltip>
            );
        }

        // Default attendance view
        const ui = getStatusUI(d.status);
        const statusColor = d.status === 'HADIR' ? '#059669' : d.status === 'ALFA' ? '#DC2626' : d.status === 'OFF' ? '#6B7280' : '#374151';
        const statusBg = d.status === 'HADIR' ? '#F0FDF4' : d.status === 'ALFA' ? '#FEF2F2' : d.status === 'OFF' ? '#F9FAFB' : '#F8FAFC';
        return (
            <ProTooltip
                title={
                    <Box>
                        <TooltipSection sx={{ bgcolor: statusBg, borderColor: statusColor + '40' }}>
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: statusColor }}>
                                {ui.icon && React.cloneElement(ui.icon, { sx: { fontSize: 14, color: statusColor } })}
                                {' '}{d.status}
                            </Typography>
                        </TooltipSection>
                        {regHours > 0 && (
                            <>
                                <TooltipRow label="Real Hours" value={`${regHours.toFixed(2)}h`} valueColor={isBelowStandard ? '#DC2626' : '#374151'} />
                                {stdPresence > 0 && (
                                    <TooltipRow label="Std Hours" value={`${stdPresence.toFixed(2)}h`} valueColor="#6B7280" />
                                )}
                                {isBelowStandard && (
                                    <Box sx={{ px: 1.5, py: 0.4, bgcolor: '#FEF2F2' }}>
                                        <Typography sx={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 600 }}>
                                            ⚠️ {(stdPresence - regHours).toFixed(2)}h di bawah standard
                                        </Typography>
                                    </Box>
                                )}
                            </>
                        )}
                        {otHours > 0 && (
                            <TooltipRow label="SPL" value={`+${otHours.toFixed(2)}h`} valueColor="#7C3AED" />
                        )}
                        {d.checkIn && (
                            <Box sx={{ px: 1.5, py: 0.4, borderTop: '1px solid', borderColor: 'divider' }}>
                                <Typography sx={{ fontSize: '0.68rem', color: '#6B7280' }}>
                                    In: {d.checkIn} &bull; Out: {d.checkOut || '-'}
                                </Typography>
                            </Box>
                        )}
                        <TooltipFooter>
                            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                                {empName} &bull; {d.date} ({d.dayName})
                            </Typography>
                        </TooltipFooter>
                    </Box>
                }
                placement="top"
            >
                <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', color: ui.text, py: 0.4 }}>
                    {renderWarning()}
                    {ui.icon ? React.cloneElement(ui.icon, { sx: { fontSize: 14 } }) : <Typography sx={{ fontSize: '0.65rem', fontWeight: 800 }}>{ui.label}</Typography>}
                </Box>
            </ProTooltip>
        );
    };
    const getSyncStatus = (ptrjId, dateStr, venusStatus, venusRegularHours = 0, venusOtHours = 0, venusIsHoliday = false) => {
        if (!compareMode || compareMode === 'off') return null;
        const hasValidPtrjId = ptrjId && ptrjId !== 'N/A' && String(ptrjId).trim() !== '';
        if (!hasValidPtrjId) return { status: 'not_synced', displayOverride: 'N/A', displayColor: '#DE350B', borderWidth: 2, isUnmapped: true, millwareHours: 0 };
        if (!comparisonData) return null;
        const cleanDate = String(dateStr).includes('T') ? dateStr.split('T')[0] : dateStr;
        const key = `${String(ptrjId).trim()}_${cleanDate}`;
        const millwareRecord = comparisonData[key];

        const date = new Date(cleanDate);
        const isSunday = date.getDay() === 0;
        const isSaturday = date.getDay() === 6;
        const needsRegular = isSunday || venusIsHoliday === true || !['ALFA', 'N/A'].includes(venusStatus?.toUpperCase());
        if (!needsRegular && (Number(venusOtHours) || 0) <= 0) return null;
        // Sunday and Holiday with Hadir status still need Millware record - NOT auto-sync
        const expectedHours = isSaturday ? 5 : 7;  // Sunday = 7, Saturday = 5, Weekday = 7
        const millwareNormalHours = millwareRecord ? (millwareRecord.normal || 0) : 0;
        const isBelowThreshold = !isSunday && millwareNormalHours > 0 && millwareNormalHours < expectedHours;
        
        if (compareMode === 'presence' || compareMode === 'regular') {
            const millwareHours = millwareNormalHours;
            if (!millwareRecord || !millwareRecord.hasRegularRecord || millwareNormalHours <= 0) return { status: 'not_synced', displayOverride: `${venusRegularHours}h`, displayColor: '#DE350B', borderWidth: 2, millwareHours: 0 };
            return { status: 'synced', millwareHours, isBelowThreshold, borderWidth: 1 };
        }
        if (compareMode === 'overtime') {
            const vOT = Number(venusOtHours) || 0;
            const millwareHours = millwareRecord ? (millwareRecord.ot || 0) : 0;
            // For overtime mode: still show regular sync status as background info
            if (vOT <= 0 && millwareHours <= 0) {
                // No OT in both systems - show regular sync status
                if (!millwareRecord || !millwareRecord.hasRegularRecord || millwareNormalHours <= 0) return { status: 'not_synced', displayOverride: `${venusRegularHours}h`, displayColor: '#DE350B', borderWidth: 2, millwareHours: 0 };
                return { status: 'synced', millwareHours, borderWidth: 1 };
            }
            if (!millwareRecord || !millwareRecord.hasOTRecord) return { status: 'not_synced', displayOverride: `${vOT}h`, displayColor: '#DE350B', borderWidth: 2, millwareHours: 0 };
            return { status: 'synced', millwareHours, borderWidth: 1 };
        }
        if (compareMode === 'all') {
            const vOT = Number(venusOtHours) || 0;
            const millwareNormal = millwareRecord ? (millwareRecord.normal || 0) : 0;
            const millwareOT = millwareRecord ? (millwareRecord.ot || 0) : 0;
            const millwareHours = millwareNormal + millwareOT;
            const regularOk = !needsRegular || (millwareRecord?.hasRegularRecord === true && millwareNormal > 0);
            const otOk = vOT <= 0 || millwareRecord?.hasOTRecord === true;

            if (!millwareRecord || !regularOk || !otOk) {
                return {
                    status: 'not_synced',
                    displayOverride: `${venusRegularHours || 0}h|${vOT}h`,
                    displayColor: '#DE350B',
                    borderWidth: 2,
                    millwareHours
                };
            }
            return { status: 'synced', millwareHours, isBelowThreshold, borderWidth: 1 };
        }
        return null;
    };

    const getSyncStyle = (sync, isToday) => {
        if (!sync) return { boxShadow: isToday ? 'inset 0 0 0 1px #2196F3' : 'none' };
        const colors = { synced: '#00875A', not_synced: '#DE350B', mismatch: '#FF991F' };
        const color = colors[sync.status] || '#ccc';
        const shadow = `inset 0 0 0 ${sync.borderWidth || 1}px ${color}${isToday ? ', inset 0 0 0 2px #2196F3' : ''}`;
        if (sync.isUnmapped) return { boxShadow: shadow, bgcolor: 'rgba(222, 53, 11, 0.08)', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(222, 53, 11, 0.05) 2px, rgba(222, 53, 11, 0.05) 4px)' };
        return { boxShadow: shadow, bgcolor: sync.status === 'not_synced' ? '#FEE2E2' : (sync.status === 'mismatch' ? '#FFF7ED' : 'inherit') };
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
                            <TableCell sx={{ position: 'sticky', left: 64, zIndex: 112, bgcolor: '#F4F5F7', width: 220, fontWeight: 800, borderRight: '2px solid #C1C7D0 !important' }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, lineHeight: 1 }}>KARYAWAN</Typography>
                                    <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, opacity: 0.7, lineHeight: 1 }}>POSISI</Typography>
                                </Box>
                            </TableCell>
                            <TableCell sx={{ position: 'sticky', left: 284, zIndex: 112, bgcolor: '#F4F5F7', width: 80, fontWeight: 800, borderRight: '2px solid #C1C7D0 !important' }}>ID PTRJ</TableCell>
                            <TableCell sx={{ position: 'sticky', left: 364, zIndex: 112, bgcolor: '#F4F5F7', width: 100, fontWeight: 800, borderRight: '2px solid #C1C7D0 !important' }} align="center">
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: '#9C27B0', lineHeight: 1 }}>TOTAL SPL</Typography>
                                    <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, color: '#7B1FA2', lineHeight: 1 }}>HARI | JAM</Typography>
                                </Box>
                            </TableCell>
                            {dayNumbers.map(day => {
                                const d = daysMap[day];
                                const isToday = Number(day) === todayNum;
                                return (
                                    <TableCell key={day} align="center" sx={{ width: dayCellWidth, minWidth: dayCellWidth, bgcolor: isToday ? '#E3F2FD' : '#F4F5F7', borderRight: d?.dayName === 'Min' ? '2px solid #C1C7D0 !important' : '1px solid #F0F0F0', boxShadow: isToday ? 'inset 0 -2px 0 #2196F3' : 'none', p: 0 }}>
                                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: isToday ? '#1976D2' : 'inherit', lineHeight: 1 }}>{day}</Typography>
                                        <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, opacity: 0.6, lineHeight: 1 }}>{d?.dayName?.substring(0, 2).toUpperCase()}</Typography>
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {visibleData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={dayNumbers.length + 4} align="center" sx={{ py: 6, color: 'text.secondary', borderRight: 'none !important' }}>
                                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                        {isFiltered ? 'Tidak ada data yang sesuai filter.' : 'Tidak ada data absensi untuk periode ini.'}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : visibleData.map((emp) => {
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
                                            const syncPres = getSyncStatus(emp.ptrjEmployeeID, d.date, d.status, d.regularHours, 0, d.isHoliday === true || Boolean(d.holidayName));
                                            const syncOT = getSyncStatus(emp.ptrjEmployeeID, d.date, d.status, 0, d.overtimeHours, d.isHoliday === true || Boolean(d.holidayName));

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
                            const frozenPaneBg = editingRow === emp.id ? '#FFF9C4' : (isSelected ? '#EAF2FF' : '#FFFFFF');
                            const frozenPaneHoverBg = editingRow === emp.id ? '#FFF4B8' : (isSelected ? '#DCEBFF' : '#F8FAFC');

                            return (
                                <React.Fragment key={emp.id}>
                                    <TableRow
                                        hover
                                        selected={isSelected}
                                        sx={{
                                            height: 32,
                                            bgcolor: frozenPaneBg,
                                            '&:hover': { bgcolor: frozenPaneHoverBg },
                                            '&:hover .matrix-frozen-cell': { backgroundColor: `${frozenPaneHoverBg} !important` },
                                        }}
                                    >
                                        <TableCell className="matrix-frozen-cell" sx={{ position: 'sticky', left: 0, zIndex: 101, backgroundColor: `${frozenPaneBg} !important`, backgroundClip: 'padding-box', p: 0, width: 64 }} align="center">
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
                                        <TableCell className="matrix-frozen-cell" sx={{ position: 'sticky', left: 64, zIndex: 101, backgroundColor: `${frozenPaneBg} !important`, backgroundClip: 'padding-box', borderRight: '2px solid #F0F0F0 !important' }}>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Avatar sx={{ width: 20, height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: 'primary.light', flexShrink: 0 }}>{emp.name.charAt(0)}</Avatar>
                                                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#172B4D', noWrap: true }}>{emp.name}</Typography>
                                                </Box>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 2.5 }}>
                                                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: '#5E6C84', noWrap: true }}>
                                                        {getStation(emp.chargeJob) || 'N/A'}
                                                    </Typography>
                                                </Box>

                                                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
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
                                        <TableCell className="matrix-frozen-cell" sx={{ position: 'sticky', left: 284, zIndex: 101, backgroundColor: `${frozenPaneBg} !important`, backgroundClip: 'padding-box', borderRight: '2px solid #F0F0F0 !important', cursor: 'pointer' }} onClick={() => handleStartEdit(emp)}>
                                            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: emp.ptrjEmployeeID ? 'secondary.main' : 'text.disabled' }}>{emp.ptrjEmployeeID || 'N/A'}</Typography>
                                        </TableCell>
                                        <TableCell className="matrix-frozen-cell" sx={{ position: 'sticky', left: 364, zIndex: 101, backgroundColor: `${frozenPaneBg} !important`, backgroundClip: 'padding-box', borderRight: '2px solid #C1C7D0 !important', boxShadow: '2px 0 0 rgba(193,199,208,0.45)' }} align="center">
                                            {(() => {
                                                const otSummary = calculateOTSummary(emp);
                                                const hasOT = otSummary.days > 0 && otSummary.hours > 0;
                                                const hasNotation = otSummary.standardHours !== otSummary.realHours;
                                                return (
                                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.2 }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            <Chip
                                                                label={`${otSummary.days}`}
                                                                size="small"
                                                                sx={{
                                                                    height: 18,
                                                                    fontSize: '0.6rem',
                                                                    fontWeight: 800,
                                                                    bgcolor: otSummary.days > 0 ? '#F3E8FF' : '#f5f5f5',
                                                                    color: otSummary.days > 0 ? '#7B1FA2' : '#757575',
                                                                    border: otSummary.days > 0 ? '1px solid #7B1FA2' : '1px solid #e0e0e0'
                                                                }}
                                                            />
                                                            <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: hasOT ? '#9C27B0' : '#757575' }}>
                                                                {otSummary.hours}h
                                                            </Typography>
                                                        </Box>
                                                        {hasNotation && (
                                                            <Typography sx={{ fontSize: '0.5rem', fontWeight: 600, color: '#7B1FA2' }}>
                                                                std: {otSummary.standardHours}h | real: {otSummary.realHours}h
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                );
                                            })()}
                                        </TableCell>

                                        {dayNumbers.map(day => {
                                            const d = emp.attendance?.[day];
                                            if (!d) return <TableCell key={day} sx={{ bgcolor: isFiltered ? '#f8fafc' : 'inherit' }} />;
                                            
                                            // Check if cell matches filter
                                            const matchesFilter = cellMatchesFilter(d, cellFilter);
                                            const isHighlighted = cellFilter?.enabled && matchesFilter;
                                            const isHidden = cellFilter?.enabled && !matchesFilter;
                                            
                                            // Skip rendering if cell doesn't match and we're in strict filter mode
                                            if (isHidden) {
                                                return (
                                                    <TableCell 
                                                        key={day} 
                                                        align="center" 
                                                        sx={{ 
                                                            bgcolor: '#f9fafb', 
                                                            borderRight: d?.dayName === 'Min' ? '2px solid #C1C7D0 !important' : '1px solid #F0F0F0', 
                                                            position: 'relative', 
                                                            p: 0,
                                                            opacity: 0.3
                                                        }}
                                                    >
                                                        <Typography sx={{ fontSize: '0.5rem', color: '#9CA3AF' }}>-</Typography>
                                                    </TableCell>
                                                );
                                            }
                                            
                                            const ui = getStatusUI(d.status);
                                            const sync = getSyncStatus(emp.ptrjEmployeeID, d.date, d.status, d.regularHours, d.overtimeHours, d.isHoliday === true || Boolean(d.holidayName));
                                            const syncStyle = getSyncStyle(sync, Number(day) === todayNum);
                                            const comparisonRecord = getComparisonRecord(emp.ptrjEmployeeID, d.date);
                                            
                                            return (
                                                <TableCell 
                                                    key={day} 
                                                    align="center" 
                                                    sx={{ 
                                                        bgcolor: isHighlighted ? '#FEF3C7' : (syncStyle.bgcolor || ui.bg), 
                                                        borderRight: d?.dayName === 'Min' ? '2px solid #C1C7D0 !important' : '1px solid #F0F0F0', 
                                                        position: 'relative', 
                                                        p: 0, 
                                                        ...syncStyle,
                                                        ...(isHighlighted ? { 
                                                            boxShadow: 'inset 0 0 0 2px #F59E0B',
                                                            animation: 'highlight-pulse 2s infinite'
                                                        } : {})
                                                    }}
                                                >
                                                    {/* Filter Match Indicator */}
                                                    {isHighlighted && (
                                                        <Typography 
                                                            sx={{ 
                                                                position: 'absolute', 
                                                                top: 0, 
                                                                left: 0, 
                                                                right: 0, 
                                                                fontSize: '0.45rem', 
                                                                fontWeight: 800, 
                                                                color: '#92400E', 
                                                                lineHeight: 1, 
                                                                zIndex: 2,
                                                                textAlign: 'center',
                                                                bgcolor: '#FCD34D'
                                                            }}
                                                        >
                                                            ✓
                                                        </Typography>
                                                    )}
                                                    {/* Small Millware Hours Indicator (Top Right) */}
                                                    {viewMode !== 'comparison' && sync && (
                                                        <Typography sx={{ position: 'absolute', top: 0.5, right: 1, fontSize: '0.45rem', fontWeight: 900, color: sync.status === 'synced' ? '#00875A' : '#DE350B', lineHeight: 1, zIndex: 1 }}>
                                                            {sync.millwareHours}h
                                                        </Typography>
                                                    )}
                                                    {sync?.status === 'not_synced' && (
                                                        <Typography sx={{ position: 'absolute', top: 0, left: 0, right: 0, fontSize: '0.48rem', fontWeight: 900, color: '#991B1B', lineHeight: 1.15, zIndex: 3, bgcolor: '#FECACA', borderBottom: '1px solid #DC2626' }}>
                                                            MISS
                                                        </Typography>
                                                    )}
                                                    {getCellContent(d, viewMode, emp.name, day, comparisonRecord, Boolean(comparisonData))}
                                                    {viewMode !== 'comparison' && sync?.displayOverride && <Typography sx={{ position: 'absolute', bottom: 1, left: 0, right: 0, fontSize: '0.55rem', fontWeight: 900, color: sync.displayColor, lineHeight: 1 }}>{sync.displayOverride}</Typography>}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>

                                    {/* Expanded Detail / Edit Row */}
                                    <TableRow sx={{ display: expandedRows.has(emp.id) ? 'table-row' : 'none', bgcolor: '#fbfbfb' }}>
                                        <TableCell colSpan={dayNumbers.length + 4} sx={{ p: 0, borderBottom: '2px solid #ddd' }}>
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

            {/* Progressive Loading Controls */}
            {!showAllRows && safeData.length > INITIAL_ROW_COUNT && (
                <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    py: 1.5, borderTop: '1px solid #DFE1E6', bgcolor: '#f8f9fa'
                }}>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setShowAllRows(true)}
                        sx={{
                            fontWeight: 700, fontSize: '0.75rem',
                            borderColor: '#7C3AED', color: '#7C3AED',
                            '&:hover': { bgcolor: 'rgba(124, 58, 237, 0.08)' }
                        }}
                    >
                        Load All ({safeData.length} employees)
                    </Button>
                </Box>
            )}

            <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(p => ({ ...p, open: false }))}><Alert severity={snackbar.severity}>{snackbar.message}</Alert></Snackbar>
        </Paper>
    );
};

export default React.memo(AttendanceMatrix, (prevProps, nextProps) => {
    return (
        prevProps.data === nextProps.data &&
        prevProps.viewMode === nextProps.viewMode &&
        prevProps.cellFilter === nextProps.cellFilter &&
        prevProps.selectedIds.length === nextProps.selectedIds.length &&
        prevProps.compareMode === nextProps.compareMode &&
        prevProps.comparisonData === nextProps.comparisonData &&
        prevProps.isLoadingComparison === nextProps.isLoadingComparison &&
        prevProps.isLoading === nextProps.isLoading &&
        prevProps.isEditMode === nextProps.isEditMode &&
        prevProps.isFiltered === nextProps.isFiltered
    );
});
