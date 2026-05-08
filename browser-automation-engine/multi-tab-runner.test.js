const assert = require('assert/strict');

const {
    buildMultiTabRunPlan,
    splitTemplateForMultiTab
} = require('./multi-tab-runner');

function employee(ptrjId) {
    return {
        EmployeeID: `VENUS-${ptrjId}`,
        EmployeeName: `Employee ${ptrjId}`,
        PTRJEmployeeID: ptrjId,
        Attendance: {
            '2026-02-24': {
                date: '2026-02-24',
                status: 'Hadir',
                regularHours: 7,
                overtimeHours: 0
            }
        }
    };
}

{
    const data = {
        metadata: { period_start: '2026-02-01', period_end: '2026-02-28' },
        data: [employee('P001'), employee('P002'), employee('P003')]
    };

    const plan = buildMultiTabRunPlan({
        data,
        requestedTabs: 5,
        maxTabs: 8,
        rowLimit: 1
    });

    assert.equal(plan.actualTabs, 1);
    assert.equal(plan.employees.length, 1);
    assert.deepEqual(plan.assignedTabs.map((tab) => tab.map((item) => item.PTRJEmployeeID)), [['P001']]);
    assert.deepEqual(plan.splitKeys, []);
}

{
    const template = {
        name: 'Test Template',
        steps: [
            { action: 'navigate', params: { url: 'http://example.test/login' } },
            {
                action: 'forEach',
                params: {
                    items: 'data.data',
                    itemName: 'employee',
                    steps: [{ action: 'log', params: { message: '${employee.EmployeeName}' } }]
                }
            },
            { action: 'log', params: { message: 'done' } }
        ]
    };

    const split = splitTemplateForMultiTab(template);

    assert.equal(split.setupSteps.length, 1);
    assert.equal(split.loopStep.params.itemName, 'employee');
    assert.equal(split.loopSteps.length, 1);
    assert.equal(split.cleanupSteps.length, 1);
    assert.equal(split.lastSetupNavigateUrl, 'http://example.test/login');
}

{
    assert.throws(
        () => splitTemplateForMultiTab({ name: 'Invalid', steps: [{ action: 'log', params: {} }] }),
        /forEach.*data\.data/
    );
}
