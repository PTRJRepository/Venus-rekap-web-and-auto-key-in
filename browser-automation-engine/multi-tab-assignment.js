function employeeAssignmentKey(employee) {
    return String(
        employee?.PTRJEmployeeID ||
        employee?.ptrjEmployeeID ||
        employee?.EmployeeID ||
        employee?.id ||
        ''
    ).trim().toUpperCase();
}

function calculateActualTabCount(requestedTabs, maxTabs, employees) {
    const requested = Number.isFinite(Number(requestedTabs)) ? Number(requestedTabs) : 1;
    const max = Number.isFinite(Number(maxTabs)) ? Number(maxTabs) : 1;
    const employeeCount = Array.isArray(employees) ? employees.length : 0;

    return Math.max(1, Math.min(Math.max(1, requested), Math.max(1, max), Math.max(1, employeeCount)));
}

function groupEmployees(employees) {
    const groups = [];
    const byKey = new Map();

    for (const employee of employees || []) {
        const key = employeeAssignmentKey(employee);
        if (!key) {
            groups.push([employee]);
            continue;
        }

        let group = byKey.get(key);
        if (!group) {
            group = [];
            byKey.set(key, group);
            groups.push(group);
        }
        group.push(employee);
    }

    return groups;
}

function assignEmployeesToTabs(employees, tabCount) {
    const actualTabCount = calculateActualTabCount(tabCount, tabCount, employees || []);
    const tabs = Array.from({ length: actualTabCount }, () => []);
    const groups = groupEmployees(employees || []);

    groups.forEach((group, index) => {
        tabs[index % actualTabCount].push(...group);
    });

    return tabs;
}

function findCrossTabEmployeeSplits(assignedTabs) {
    const ownerByKey = new Map();
    const splits = new Set();

    (assignedTabs || []).forEach((tab, tabIndex) => {
        (tab || []).forEach((employee) => {
            const key = employeeAssignmentKey(employee);
            if (!key) return;

            const owner = ownerByKey.get(key);
            if (owner === undefined) {
                ownerByKey.set(key, tabIndex);
            } else if (owner !== tabIndex) {
                splits.add(key);
            }
        });
    });

    return [...splits].sort();
}

module.exports = {
    assignEmployeesToTabs,
    calculateActualTabCount,
    employeeAssignmentKey,
    findCrossTabEmployeeSplits
};
