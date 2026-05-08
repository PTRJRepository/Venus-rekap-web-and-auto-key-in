import React from 'react';
import { Chip, Tooltip, alpha } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import HourglassIcon from '@mui/icons-material/HourglassEmpty';
import SyncIcon from '@mui/icons-material/Sync';
import { STATUS } from '../theme';

const STATUS_CONFIG = {
    HADIR:    { label: 'Hadir',    ...STATUS.hadir },
    ALFA:     { label: 'Alfa',     ...STATUS.alfa },
    OFF:      { label: 'Off',      ...STATUS.off },
    LIBUR:    { label: 'Libur',    ...STATUS.off },
    CUTI:     { label: 'Cuti',     ...STATUS.cuti },
    IZIN:     { label: 'Izin',     ...STATUS.cuti },
    SAKIT:    { label: 'Sakit',    ...STATUS.sakit },
    OT:       { label: 'OT',       ...STATUS.overtime },
    INCOMPLETE: { label: 'Incomplete', ...STATUS.alfa },
};

export const SyncStatusConfig = {
    synced:      { label: 'Synced',      color: '#10B981', bg: '#ECFDF5' },
    not_synced:  { label: 'Not Synced', color: '#EF4444', bg: '#FEF2F2' },
    mismatch:    { label: 'Mismatch',   color: '#F59E0B', bg: '#FFFBEB' },
    pending:     { label: 'Pending',     color: '#64748B', bg: '#F8FAFC' },
};

export const SyncStatusIcon = ({ status }) => {
    const icons = {
        synced:     <CheckCircleIcon sx={{ fontSize: 15 }} />,
        not_synced: <CancelIcon sx={{ fontSize: 15 }} />,
        mismatch:   <WarningIcon sx={{ fontSize: 15 }} />,
        pending:    <HourglassIcon sx={{ fontSize: 15 }} />,
    };
    const config = SyncStatusConfig[status] || SyncStatusConfig.pending;
    return <Box sx={{ color: config.color, display: 'flex' }}>{icons[status] || icons.pending}</Box>;
};

export const StatusBadge = ({ status, showLabel = true, size = 'small', tooltip }) => {
    const st = (status || '').toUpperCase().replace(/ /g, '_');
    const config = STATUS_CONFIG[st] || {
        bg: '#F4F5F5', text: '#5E6C84', border: '#E0E0E0',
        label: status || 'Unknown',
    };

    const chip = (
        <Chip
            size={size}
            label={showLabel ? config.label : ''}
            sx={{
                bgcolor: config.bg,
                color: config.text,
                border: `1px solid ${config.border}`,
                fontWeight: 700,
                fontSize: size === 'small' ? '0.7rem' : '0.75rem',
                height: size === 'small' ? 22 : 26,
                borderRadius: '4px',
                '& .MuiChip-label': { px: 1 },
            }}
        />
    );

    return tooltip ? <Tooltip title={tooltip} arrow>{chip}</Tooltip> : chip;
};

export const SyncBadge = ({ status, size = 'small', tooltip }) => {
    const config = SyncStatusConfig[status] || SyncStatusConfig.pending;
    const chip = (
        <Chip
            size={size}
            icon={<SyncStatusIcon status={status} />}
            label={config.label}
            sx={{
                bgcolor: config.bg,
                color: config.color,
                border: `1px solid ${alpha(config.color, 0.3)}`,
                fontWeight: 700,
                fontSize: size === 'small' ? '0.7rem' : '0.75rem',
                height: size === 'small' ? 22 : 26,
                borderRadius: '4px',
                '& .MuiChip-label': { px: 0.5 },
                '& .MuiChip-icon': { ml: 0.5, color: 'inherit' },
            }}
        />
    );
    return tooltip ? <Tooltip title={tooltip} arrow>{chip}</Tooltip> : chip;
};

export default StatusBadge;
