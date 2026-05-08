import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getFallbackAttendancePeriod,
    getYearOptions,
    normalizeAttendancePeriod
} from './period.js';

test('normalizes latest-period API values to numbers', () => {
    assert.deepEqual(normalizeAttendancePeriod({ month: '4', year: '2026' }), {
        month: 4,
        year: 2026
    });
});

test('rejects invalid latest-period API values', () => {
    assert.equal(normalizeAttendancePeriod({ month: 13, year: 2026 }), null);
    assert.equal(normalizeAttendancePeriod({ month: 4, year: 'x' }), null);
});

test('fallback attendance period uses previous month before mid-month', () => {
    assert.deepEqual(getFallbackAttendancePeriod(new Date(2026, 0, 7)), {
        month: 12,
        year: 2025
    });
});

test('year options include the selected latest attendance year', () => {
    assert.deepEqual(getYearOptions(2027, new Date(2026, 4, 7)), [
        2024,
        2025,
        2026,
        2027
    ]);
});
