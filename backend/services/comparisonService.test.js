const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const gatewayPath = path.resolve(__dirname, 'gateway.js');
const comparisonServicePath = path.resolve(__dirname, 'comparisonService.js');

let millwareRows = [];

require.cache[gatewayPath] = {
    id: gatewayPath,
    filename: gatewayPath,
    loaded: true,
    exports: {
        executeQuery: async () => millwareRows
    }
};

delete require.cache[comparisonServicePath];

const {
    compareWithTaskReg,
    requiresMillwareRegularRecord,
    normalizeOTValue
} = require('./comparisonService');

const buildEmployee = (status, overrides = {}) => ({
    id: 'VEN001',
    name: 'Test Employee',
    ptrjEmployeeID: 'POM00214',
    attendance: {
        3: {
            date: '2026-05-03',
            status,
            regularHours: 7,
            overtimeHours: 0,
            ...overrides
        }
    }
});

const compareOneDay = async (status, rows = [], overrides = {}) => {
    millwareRows = rows;
    const result = await compareWithTaskReg(
        [buildEmployee(status, overrides)],
        '2026-05-01',
        '2026-05-31'
    );
    return result.results[0];
};

test('regular Millware record is required for Sunday OFF auto-attendance', async () => {
    const row = await compareOneDay('OFF');

    assert.equal(row.status, 'MISS');
    assert.notEqual(row.syncStatus, 'synced');
    assert.equal(row.details.hasRegularRecord, false);
    assert.equal(row.details.regularMatched, false);
});

test('regular Millware record is required for national holiday auto-attendance', async () => {
    const row = await compareOneDay('LBR');

    assert.equal(row.status, 'MISS');
    assert.notEqual(row.syncStatus, 'synced');
    assert.equal(row.details.hasRegularRecord, false);
    assert.equal(row.details.regularMatched, false);
});

test('ALFA and N/A do not require a Millware regular record', () => {
    assert.equal(requiresMillwareRegularRecord('ALFA'), false);
    assert.equal(requiresMillwareRegularRecord('N/A'), false);
    assert.equal(requiresMillwareRegularRecord('N/A', { date: '2026-05-03' }), true);
    assert.equal(requiresMillwareRegularRecord('ALFA', { date: '2026-05-04', isHoliday: true }), true);
    assert.equal(requiresMillwareRegularRecord('OFF'), true);
    assert.equal(requiresMillwareRegularRecord('LBR'), true);
    assert.equal(requiresMillwareRegularRecord('LIBUR'), true);
});

test('Sunday requires Millware regular record even when Venus status is N/A', async () => {
    const row = await compareOneDay('N/A');

    assert.equal(row.status, 'MISS');
    assert.notEqual(row.syncStatus, 'synced');
    assert.equal(row.details.needsRegularRecord, true);
    assert.equal(row.details.hasRegularRecord, false);
});

test('Sunday OFF can sync when Millware regular record exists', async () => {
    const row = await compareOneDay('OFF', [
        {
            EmpCode: 'POM00214',
            TrxDate: '2026-05-03',
            TaskCode: 'GA9129',
            Hours: 7,
            Amount: 0,
            OT: 0,
            Status: 'A',
            ChargeTo: null,
            NormalDay: 1,
            CreatedBy: 'test',
            CreatedDate: '2026-05-03'
        }
    ]);

    assert.equal(row.status, 'MATCH');
    assert.equal(row.syncStatus, 'synced');
    assert.equal(row.details.hasRegularRecord, true);
    assert.equal(row.details.regularMatched, true);
});

test('SQL Server BIT false is treated as regular OT=0 record', async () => {
    const row = await compareOneDay('OFF', [
        {
            EmpCode: 'POM00214',
            TrxDate: '2026-05-03',
            Hours: 7,
            Amount: 134499.99997,
            OT: false
        }
    ]);

    assert.equal(normalizeOTValue(false), 0);
    assert.equal(normalizeOTValue('0'), 0);
    assert.equal(normalizeOTValue(true), 1);
    assert.equal(normalizeOTValue('1'), 1);
    assert.equal(row.status, 'MATCH');
    assert.equal(row.syncStatus, 'synced');
    assert.equal(row.details.hasRegularRecord, true);
    assert.equal(row.details.regularRecordCount, 1);
});

test('Sunday OFF stays MISS when Millware regular row has zero hours', async () => {
    const row = await compareOneDay('OFF', [
        {
            EmpCode: 'POM00214',
            TrxDate: '2026-05-03',
            TaskCode: 'GA9129',
            Hours: 0,
            Amount: 0,
            OT: 0,
            Status: 'A',
            ChargeTo: null,
            NormalDay: 1,
            CreatedBy: 'test',
            CreatedDate: '2026-05-03'
        }
    ]);

    assert.equal(row.status, 'MISS');
    assert.notEqual(row.syncStatus, 'synced');
    assert.equal(row.details.hasRegularRecord, false);
    assert.equal(row.details.regularMatched, false);
});
