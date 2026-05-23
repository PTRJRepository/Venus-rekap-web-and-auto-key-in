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
    const workCount = countEmployeeInputRows(employees);

    return Math.max(1, Math.min(Math.max(1, requested), Math.max(1, max), Math.max(1, workCount)));
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

    for (const group of groups) {
        const rows = explodeGroupToAttendanceRows(group);
        const shouldSplitByDate = rows.length > group.length && group.length < actualTabCount;

        if (shouldSplitByDate) {
            for (const row of rows) {
                const tabIndex = leastLoadedTabIndex(tabs);
                mergeEmployeeAttendanceIntoTab(tabs[tabIndex], row);
            }
            continue;
        }

        const tabIndex = leastLoadedTabIndex(tabs);
        tabs[tabIndex].push(...group);
    }

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

function findCrossTabInputRowSplits(assignedTabs) {
    const ownerByKey = new Map();
    const splits = new Set();

    (assignedTabs || []).forEach((tab, tabIndex) => {
        (tab || []).forEach((employee) => {
            for (const key of employeeInputIdentityKeys(employee)) {
                const owner = ownerByKey.get(key);
                if (owner === undefined) {
                    ownerByKey.set(key, tabIndex);
                } else if (owner !== tabIndex) {
                    splits.add(key);
                }
            }
        });
    });

    return [...splits].sort();
}

function attendanceKeys(employee) {
    return employee?.Attendance && typeof employee.Attendance === 'object'
        ? Object.keys(employee.Attendance).sort()
        : [];
}

function countEmployeeInputRows(employees) {
    return (employees || []).reduce((total, employee) => {
        const dates = attendanceKeys(employee);
        return total + Math.max(1, dates.length);
    }, 0);
}

function tabWorkCount(tab) {
    return (tab || []).reduce((total, employee) => total + Math.max(1, attendanceKeys(employee).length), 0);
}

function leastLoadedTabIndex(tabs) {
    let bestIndex = 0;
    let bestCount = Infinity;

    tabs.forEach((tab, index) => {
        const count = tabWorkCount(tab);
        if (count < bestCount) {
            bestCount = count;
            bestIndex = index;
        }
    });

    return bestIndex;
}

function explodeGroupToAttendanceRows(group) {
    const rows = [];

    for (const employee of group || []) {
        const dates = attendanceKeys(employee);
        if (dates.length === 0) {
            rows.push(employee);
            continue;
        }

        for (const date of dates) {
            rows.push({
                ...employee,
                Attendance: {
                    [date]: employee.Attendance[date]
                }
            });
        }
    }

    return rows;
}

function mergeEmployeeAttendanceIntoTab(tab, employee) {
    const key = employeeAssignmentKey(employee);
    const dates = attendanceKeys(employee);

    if (!key || dates.length === 0) {
        tab.push(employee);
        return;
    }

    const existing = tab.find((item) => employeeAssignmentKey(item) === key);
    if (!existing) {
        tab.push(employee);
        return;
    }

    existing.Attendance = {
        ...(existing.Attendance || {}),
        ...(employee.Attendance || {})
    };
}

/**
 * Detect duplicate input rows before browser automation begins.
 * Two rows are considered duplicates if they have the same employee + date key.
 *
 * Returns an array of duplicate keys (sorted).
 */
function duplicateInputRowKeys(employees) {
    const seen = new Map();
    const duplicates = [];

    for (const emp of employees || []) {
        for (const key of employeeInputIdentityKeys(emp)) {
            if (seen.has(key)) {
                if (!duplicates.includes(key)) {
                    duplicates.push(key);
                }
            } else {
                seen.set(key, true);
            }
        }
    }

    return duplicates.sort();
}

/**
 * Build a unique identity key for an employee record.
 * Combines: employee ID + date (yyyy-MM-dd) for attendance automation.
 */
function employeeInputIdentityKey(employee) {
    return employeeInputIdentityKeys(employee)[0] || '|';
}

function employeeInputIdentityKeys(employee) {
    const empId = String(
        employee?.PTRJEmployeeID ||
        employee?.ptrjEmployeeID ||
        employee?.EmployeeID ||
        employee?.id ||
        ''
    ).trim().toUpperCase();

    const dates = attendanceKeys(employee);
    if (dates.length > 0) {
        return dates.map((date) => `${empId}|${date}`);
    }

    const date = employee?.Date ||
        employee?.Tanggal ||
        employee?.date ||
        '';

    return [`${empId}|${date}`];
}

module.exports = {
    assignEmployeesToTabs,
    calculateActualTabCount,
    countEmployeeInputRows,
    employeeAssignmentKey,
    findCrossTabEmployeeSplits,
    findCrossTabInputRowSplits,
    duplicateInputRowKeys,
    employeeInputIdentityKey,
    employeeInputIdentityKeys
};
