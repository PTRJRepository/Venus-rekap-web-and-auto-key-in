const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildLatestAttendanceDateQuery,
    getFallbackPeriod,
    getLatestAttendancePeriod,
    periodFromDate
} = require('./latestPeriodService');

test('latest attendance query checks summary and manual input tables', () => {
    const sql = buildLatestAttendanceDateQuery();

    assert.match(sql, /HR_T_TAMachine_Summary/);
    assert.match(sql, /HR_T_TAMachineInput_D/);
    assert.match(sql, /MAX\(TADate\)/i);
});

test('periodFromDate returns month and year from latest attendance date', () => {
    assert.deepEqual(periodFromDate('2026-04-30T00:00:00.000Z'), {
        month: 4,
        year: 2026
    });
});

test('getLatestAttendancePeriod returns fallback when no attendance date exists', async () => {
    const period = await getLatestAttendancePeriod(async () => [], new Date(2026, 4, 7));

    assert.deepEqual(period, { month: 4, year: 2026 });
});

test('getFallbackPeriod uses previous month before mid-month', () => {
    assert.deepEqual(getFallbackPeriod(new Date(2026, 0, 7)), {
        month: 12,
        year: 2025
    });
});
