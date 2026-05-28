/**
 * Per-employee monthly summary computation.
 * Pure module: no React/DOM. Computes attendance counts, hours totals,
 * and attendance percentage for each employee.
 */

import type { AttendanceRecord, DayMeta, Employee } from '../types';

export interface EmployeeSummaryRow {
  employeeId: string;
  presentCount: number;
  alphaCount: number;
  leaveCount: number;
  sickCount: number;
  lateCount: number;
  offCount: number;
  totalWorkHours: number;
  totalShortHours: number;
  totalOvertimeHours: number;
  attendancePercent: number;
}

const REQUIRED_WORK_HOURS = 7;

export function computeEmployeeSummaries(
  employees: Employee[],
  attendance: Map<string, AttendanceRecord>,
  days: DayMeta[],
): Map<string, EmployeeSummaryRow> {
  const workdays = days.filter((d) => !d.isWeekend && !d.isHoliday);
  const workdayCount = workdays.length;
  const workdayDates = new Set(workdays.map((d) => d.date));

  const result = new Map<string, EmployeeSummaryRow>();

  for (const emp of employees) {
    let presentCount = 0;
    let alphaCount = 0;
    let leaveCount = 0;
    let sickCount = 0;
    let lateCount = 0;
    let offCount = 0;
    let totalWorkHours = 0;
    let totalShortHours = 0;
    let totalOvertimeHours = 0;

    for (const day of days) {
      const key = `${emp.employeeId}|${day.date}`;
      const record = attendance.get(key);
      if (!record) continue;

      switch (record.status) {
        case 'present': presentCount++; break;
        case 'alpha': alphaCount++; break;
        case 'leave': leaveCount++; break;
        case 'sick': sickCount++; break;
        case 'late': lateCount++; presentCount++; break;
        case 'off': offCount++; break;
      }

      const regular = record.regularHours ?? 0;
      const overtime = record.overtimeHours ?? 0;
      totalWorkHours += regular;
      totalOvertimeHours += overtime;

      if (workdayDates.has(day.date) && record.status !== 'off') {
        const short = Math.max(0, REQUIRED_WORK_HOURS - regular);
        totalShortHours += short;
      }
    }

    const denominator = workdayCount || 1;
    const attendancePercent = Math.round((presentCount / denominator) * 100);

    result.set(emp.employeeId, {
      employeeId: emp.employeeId,
      presentCount,
      alphaCount,
      leaveCount,
      sickCount,
      lateCount,
      offCount,
      totalWorkHours: Math.round(totalWorkHours * 10) / 10,
      totalShortHours: Math.round(totalShortHours * 10) / 10,
      totalOvertimeHours: Math.round(totalOvertimeHours * 10) / 10,
      attendancePercent,
    });
  }

  return result;
}
