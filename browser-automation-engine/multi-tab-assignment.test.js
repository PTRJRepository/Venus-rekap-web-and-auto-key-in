const assert = require('assert/strict');

const {
    assignEmployeesToTabs,
    calculateActualTabCount,
    findCrossTabEmployeeSplits
} = require('./multi-tab-assignment');

function employee(ptrjId, attendanceDates = ['2026-02-24'], extra = {}) {
    const Attendance = {};
    for (const date of attendanceDates) {
        Attendance[date] = {
            date,
            status: 'Hadir',
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
    const employees = [
        employee('P001', ['2026-02-24', '2026-02-25']),
        employee('P002', ['2026-02-24']),
        employee('P003', ['2026-02-24'])
    ];

    const assigned = assignEmployeesToTabs(employees, 2);

    assert.equal(assigned.length, 2);
    assert.deepEqual(assigned[0].map((item) => item.PTRJEmployeeID), ['P001', 'P003']);
    assert.deepEqual(assigned[1].map((item) => item.PTRJEmployeeID), ['P002']);
    assert.deepEqual(Object.keys(assigned[0][0].Attendance), ['2026-02-24', '2026-02-25']);
    assert.deepEqual(findCrossTabEmployeeSplits(assigned), []);
}

{
    const duplicatedEmployeeRows = [
        employee('P001', ['2026-02-24']),
        employee('P002', ['2026-02-24']),
        employee('P001', ['2026-02-25'], { EmployeeID: 'VENUS-P001-B' })
    ];

    const assigned = assignEmployeesToTabs(duplicatedEmployeeRows, 2);
    const tabsWithP001 = assigned.filter((tab) => tab.some((item) => item.PTRJEmployeeID === 'P001'));

    assert.equal(tabsWithP001.length, 1);
    assert.deepEqual(tabsWithP001[0].map((item) => item.PTRJEmployeeID), ['P001', 'P001']);
    assert.deepEqual(findCrossTabEmployeeSplits(assigned), []);
}

{
    const invalidAssignment = [
        [employee('P001', ['2026-02-24'])],
        [employee('P001', ['2026-02-25'])]
    ];

    assert.deepEqual(findCrossTabEmployeeSplits(invalidAssignment), ['P001']);
}

{
    const employees = [
        employee('P001'),
        employee('P002'),
        employee('P003'),
        employee('P004')
    ];

    assert.equal(calculateActualTabCount(4, 8, [employee('P001')]), 1);
    assert.equal(calculateActualTabCount(0, 8, employees), 1);
    assert.equal(calculateActualTabCount(10, 3, employees), 3);
    assert.equal(calculateActualTabCount(2, 8, []), 1);
}
