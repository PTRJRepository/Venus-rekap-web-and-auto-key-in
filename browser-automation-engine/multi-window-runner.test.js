const assert = require('assert/strict');

const {
    buildAttendanceWorkItems,
    buildWindowRunPlan,
    calculateActualWindowCount,
    estimateAttendanceWork
} = require('./multi-window-runner');

function employee(ptrjId, dates, extra = {}) {
    const Attendance = {};
    for (const date of dates) {
        Attendance[date] = {
            date,
            status: 'HADIR',
            regularHours: 7,
            overtimeHours: 0
        };
    }

    return {
        EmployeeID: `VENUS-${ptrjId}`,
        EmployeeName: `Employee ${ptrjId}`,
        PTRJEmployeeID: ptrjId,
        ChargeJob: '(TEST) TEST JOB',
        Attendance,
        ...extra
    };
}

{
    assert.equal(calculateActualWindowCount(3, 6, 10), 3);
    assert.equal(calculateActualWindowCount(0, 6, 10), 1);
    assert.equal(calculateActualWindowCount(10, 6, 10), 6);
    assert.equal(calculateActualWindowCount(5, 6, 2), 2);
}

{
    assert.equal(estimateAttendanceWork({ status: 'HADIR', regularHours: 7, overtimeHours: 0 }), 1);
    assert.equal(estimateAttendanceWork({ status: 'HADIR', regularHours: 7, overtimeHours: 2 }), 2);
    assert.equal(estimateAttendanceWork({ status: 'HADIR', regularHours: 7, overtimeHours: 2 }, { onlyOvertime: true }), 1);
    assert.equal(estimateAttendanceWork({ status: 'HADIR', regularHours: 7, overtimeHours: 2 }, { syncRegularOnly: true }), 1);
}

{
    const employees = [
        employee('P001', ['2026-02-24', '2026-02-25', '2026-02-26']),
        employee('P002', ['2026-02-24'])
    ];

    const items = buildAttendanceWorkItems(employees);
    assert.equal(items.length, 4);
    assert.deepEqual(items.map((item) => item.date).sort(), [
        '2026-02-24',
        '2026-02-24',
        '2026-02-25',
        '2026-02-26'
    ]);
}

{
    const data = {
        metadata: { period_start: '2026-02-01', period_end: '2026-02-28' },
        data: [
            employee('P001', ['2026-02-24', '2026-02-25', '2026-02-26']),
            employee('P002', ['2026-02-24']),
            employee('P003', ['2026-02-24', '2026-02-25'])
        ]
    };

    const plan = buildWindowRunPlan({
        data,
        requestedWindows: 2,
        maxWindows: 6,
        tabsPerWindow: 8
    });

    assert.equal(plan.actualWindows, 2);
    assert.equal(plan.totalCapacity, 16);
    assert.equal(plan.totalAttendanceRecords, 6);
    assert.deepEqual(plan.partitions.map((partition) => partition.attendanceCount).sort(), [3, 3]);

    const seen = new Set();
    for (const partition of plan.partitions) {
        for (const emp of partition.employees) {
            for (const date of Object.keys(emp.Attendance)) {
                const key = `${emp.PTRJEmployeeID}|${date}`;
                assert.equal(seen.has(key), false, `duplicate work item ${key}`);
                seen.add(key);
            }
        }
    }
    assert.equal(seen.size, 6);
}
