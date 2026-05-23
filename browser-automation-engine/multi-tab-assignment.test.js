const assert = require('assert/strict');

const {
    assignEmployeesToTabs,
    calculateActualTabCount,
    countEmployeeInputRows,
    duplicateInputRowKeys,
    findCrossTabEmployeeSplits,
    findCrossTabInputRowSplits
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
    assert.deepEqual(assigned.map((tab) => countEmployeeInputRows(tab)), [2, 2]);
    assert.deepEqual(findCrossTabInputRowSplits(assigned), []);
    assert.deepEqual(
        assigned.flatMap((tab) => tab.flatMap((item) => Object.keys(item.Attendance))).sort(),
        ['2026-02-24', '2026-02-24', '2026-02-24', '2026-02-25']
    );
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
    assert.deepEqual(findCrossTabInputRowSplits(assigned), []);
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

{
    const employees = [
        employee('P001', [
            '2026-02-24',
            '2026-02-25',
            '2026-02-26',
            '2026-02-27',
            '2026-02-28'
        ])
    ];

    assert.equal(countEmployeeInputRows(employees), 5);
    assert.equal(calculateActualTabCount(5, 8, employees), 5);

    const assigned = assignEmployeesToTabs(employees, 5);
    assert.equal(assigned.length, 5);
    assert.deepEqual(assigned.map((tab) => countEmployeeInputRows(tab)), [1, 1, 1, 1, 1]);
    assert.deepEqual(findCrossTabInputRowSplits(assigned), []);
    assert.deepEqual(
        assigned.flatMap((tab) => tab.flatMap((item) => Object.keys(item.Attendance))).sort(),
        [
            '2026-02-24',
            '2026-02-25',
            '2026-02-26',
            '2026-02-27',
            '2026-02-28'
        ]
    );
}

{
    const employees = [
        employee('P001', ['2026-02-24', '2026-02-25', '2026-02-26']),
        employee('P002', ['2026-02-24', '2026-02-25'])
    ];

    const assigned = assignEmployeesToTabs(employees, 4);
    assert.equal(assigned.length, 4);
    assert.deepEqual(assigned.map((tab) => countEmployeeInputRows(tab)), [2, 1, 1, 1]);
    assert.deepEqual(findCrossTabInputRowSplits(assigned), []);
}

{
    const duplicateRows = [
        employee('P001', ['2026-02-24', '2026-02-25']),
        employee('P001', ['2026-02-25'])
    ];

    assert.deepEqual(duplicateInputRowKeys(duplicateRows), ['P001|2026-02-25']);
}
