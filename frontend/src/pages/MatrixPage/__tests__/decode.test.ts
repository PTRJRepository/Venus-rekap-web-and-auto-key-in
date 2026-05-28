// Feature: matrix-kehadiran-dark-redesign, Task 5.3
//
// Unit tests for `decodeBackendResponse` covering:
//   - Each documented backend status token decodes to the documented
//     frontend `AttendanceStatus`.
//   - Unknown tokens are SKIPPED (no attendance record emitted).
//   - The derived `days` array matches the calendar length and reflects
//     `isHoliday` flags from the backend payload.
//   - Employee derivation: `department` is the first non-empty
//     `chargeJob` across the employee's day cells.
//   - `workHours` is the sum of `regularHours + overtimeHours`.
//
// Validates: Requirements 13.1, 13.2, 13.6, 6.9.

import { describe, it, expect } from 'vitest';
import { decodeBackendResponse } from '../domain/decode';
import type { BackendMonthlyGridResponse } from '../types';

const fixture: BackendMonthlyGridResponse = {
  success: true,
  year: 2026,
  month: 5,
  month_name: 'Mei',
  days_in_month: 31,
  total_employees: 1,
  date_range: '2026-05-01..2026-05-31',
  data_availability: {
    latest_available_date: '2026-05-15',
    available_days_count: 15,
    total_days_in_month: 31,
    has_unavailable_dates: true,
  },
  grid_data: [
    {
      No: 1,
      EmployeeID: 'EMP001',
      EmployeeName: 'Budi',
      PTRJEmployeeID: 'PTRJ001',
      days: {
        '1': {
          date: '2026-05-01',
          dayName: 'Jum',
          status: 'HADIR',
          checkIn: '08:00',
          checkOut: '17:00',
          regularHours: 8,
          overtimeHours: 1,
          chargeJob: 'GA010',
          isHoliday: false,
          holidayName: null,
          isSunday: false,
        },
        '2': {
          date: '2026-05-02',
          dayName: 'Sab',
          status: 'OFF',
          checkIn: null,
          checkOut: null,
          regularHours: 0,
          overtimeHours: 0,
          chargeJob: '',
          isHoliday: false,
          holidayName: null,
          isSunday: false,
        },
        '3': {
          date: '2026-05-03',
          dayName: 'Min',
          status: 'LIBUR',
          checkIn: null,
          checkOut: null,
          regularHours: 0,
          overtimeHours: 0,
          chargeJob: '',
          isHoliday: true,
          holidayName: 'Hari Buruh',
          isSunday: true,
        },
        '4': {
          date: '2026-05-04',
          dayName: 'Sen',
          status: 'ALFA',
          checkIn: null,
          checkOut: null,
          regularHours: 0,
          overtimeHours: 0,
          chargeJob: '',
          isHoliday: false,
          holidayName: null,
          isSunday: false,
        },
        '5': {
          date: '2026-05-05',
          dayName: 'Sel',
          status: 'CT',
          checkIn: null,
          checkOut: null,
          regularHours: 0,
          overtimeHours: 0,
          chargeJob: '',
          isHoliday: false,
          holidayName: null,
          isSunday: false,
        },
        '6': {
          date: '2026-05-06',
          dayName: 'Rab',
          status: 'S',
          checkIn: null,
          checkOut: null,
          regularHours: 0,
          overtimeHours: 0,
          chargeJob: '',
          isHoliday: false,
          holidayName: null,
          isSunday: false,
        },
        '7': {
          date: '2026-05-07',
          dayName: 'Kam',
          status: 'PARTIAL_HADIR',
          checkIn: '08:30',
          checkOut: '12:00',
          regularHours: 4,
          overtimeHours: 0,
          chargeJob: 'GA010',
          isHoliday: false,
          holidayName: null,
          isSunday: false,
        },
        '8': {
          date: '2026-05-08',
          dayName: 'Jum',
          status: 'UNKNOWN_TOKEN',
          checkIn: null,
          checkOut: null,
          regularHours: 0,
          overtimeHours: 0,
          chargeJob: '',
          isHoliday: false,
          holidayName: null,
          isSunday: false,
        },
      },
    },
  ],
};

describe('decodeBackendResponse', () => {
  describe('status token mapping', () => {
    const decoded = decodeBackendResponse(fixture);

    it('decodes HADIR → present and stores a record at the canonical key', () => {
      const record = decoded.attendance.get('EMP001|2026-05-01');
      expect(record).toBeDefined();
      expect(record?.status).toBe('present');
    });

    it('decodes OFF → off', () => {
      expect(decoded.attendance.get('EMP001|2026-05-02')?.status).toBe('off');
    });

    it('decodes LIBUR → off', () => {
      expect(decoded.attendance.get('EMP001|2026-05-03')?.status).toBe('off');
    });

    it('decodes ALFA → alpha', () => {
      expect(decoded.attendance.get('EMP001|2026-05-04')?.status).toBe('alpha');
    });

    it('decodes CT → leave', () => {
      expect(decoded.attendance.get('EMP001|2026-05-05')?.status).toBe('leave');
    });

    it('decodes S → sick', () => {
      expect(decoded.attendance.get('EMP001|2026-05-06')?.status).toBe('sick');
    });

    it('decodes PARTIAL_HADIR → present', () => {
      expect(decoded.attendance.get('EMP001|2026-05-07')?.status).toBe(
        'present',
      );
    });

    it('skips unknown status tokens (no record stored)', () => {
      expect(decoded.attendance.get('EMP001|2026-05-08')).toBeUndefined();
    });
  });

  describe('days array', () => {
    const decoded = decodeBackendResponse(fixture);

    it('has length 31 (May has 31 days)', () => {
      expect(decoded.days.length).toBe(31);
    });

    it('overlays isHoliday=true on 2026-05-03 (day index 2)', () => {
      expect(decoded.days[2].date).toBe('2026-05-03');
      expect(decoded.days[2].isHoliday).toBe(true);
    });

    it('leaves non-holiday days with isHoliday=false', () => {
      expect(decoded.days[0].isHoliday).toBe(false);
      expect(decoded.days[1].isHoliday).toBe(false);
    });
  });

  describe('employees array', () => {
    const decoded = decodeBackendResponse(fixture);

    it('has one employee', () => {
      expect(decoded.employees.length).toBe(1);
    });

    it('captures the employee name', () => {
      expect(decoded.employees[0].name).toBe('Budi');
    });

    it('derives department from the first non-empty chargeJob', () => {
      expect(decoded.employees[0].department).toBe('GA010');
    });

    it('captures employeeId and ptrjEmployeeId', () => {
      expect(decoded.employees[0].employeeId).toBe('EMP001');
      expect(decoded.employees[0].ptrjEmployeeId).toBe('PTRJ001');
    });
  });

  describe('attendance record fields', () => {
    const decoded = decodeBackendResponse(fixture);

    it('sums regularHours + overtimeHours into workHours for day 1 (8 + 1 = 9)', () => {
      expect(decoded.attendance.get('EMP001|2026-05-01')?.workHours).toBe(9);
    });

    it('sets workHours to null when both regular and overtime are 0 (day 4 ALFA)', () => {
      expect(decoded.attendance.get('EMP001|2026-05-04')?.workHours).toBeNull();
    });

    it('preserves checkIn / checkOut on day 1', () => {
      const record = decoded.attendance.get('EMP001|2026-05-01');
      expect(record?.checkIn).toBe('08:00');
      expect(record?.checkOut).toBe('17:00');
    });

    it('coerces empty chargeJob to null in note (day 4 ALFA)', () => {
      expect(decoded.attendance.get('EMP001|2026-05-04')?.note).toBeNull();
    });

    it('preserves non-empty chargeJob in note (day 1 HADIR)', () => {
      expect(decoded.attendance.get('EMP001|2026-05-01')?.note).toBe('GA010');
    });
  });
});
