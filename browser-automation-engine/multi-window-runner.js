/**
 * multi-window-runner.js
 *
 * Runs several Chrome windows in parallel. Each window delegates to
 * multi-tab-runner.js, which keeps the per-window tab limit at 8.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { emit } = require('./ndjson-emitter');
const { employeeAssignmentKey } = require('./multi-tab-assignment');

const DEFAULT_TEMPLATE_NAME = 'attendance-input-loop';
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_data.json');
const MULTI_TAB_RUNNER = path.join(__dirname, 'multi-tab-runner.js');
const DEFAULT_TABS_PER_WINDOW = 8;
const DEFAULT_MAX_WINDOWS = 6;

const parsePositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNonNegativeInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

function resolveTemplateAndData(argv = process.argv.slice(2)) {
    let templateName = DEFAULT_TEMPLATE_NAME;
    let dataFilePath = DEFAULT_DATA_FILE;

    const positional = argv.filter((arg) => !arg.startsWith('--'));
    const first = positional[0];
    const second = positional[1];

    if (first) {
        const templatePath = path.join(__dirname, 'templates', `${first}.json`);
        if (fs.existsSync(templatePath)) {
            templateName = first;
            dataFilePath = second || DEFAULT_DATA_FILE;
        } else {
            dataFilePath = first;
            templateName = second || DEFAULT_TEMPLATE_NAME;
        }
    }

    return { templateName, dataFilePath };
}

function loadJson(filePath) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`File tidak ditemukan: ${fullPath}`);
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function getEmployeeList(data) {
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.employees)) return data.employees;
    return [];
}

function createPartitionedData(data, employees, metadata) {
    const next = Array.isArray(data?.employees)
        ? { ...data, employees }
        : { ...data, data: employees };

    next.metadata = {
        ...(data.metadata || {}),
        ...(metadata || {})
    };

    return next;
}

function attendanceEntries(employee) {
    if (!employee?.Attendance || typeof employee.Attendance !== 'object') return [];
    return Object.entries(employee.Attendance);
}

function estimateAttendanceWork(attendance, metadata = {}) {
    if (!attendance || typeof attendance !== 'object') return 1;

    const status = String(attendance.status || '').trim().toUpperCase();
    if (status === 'ALFA' || status === 'N/A') return 0;

    const onlyOvertime = metadata.onlyOvertime === true;
    const syncRegularOnly = metadata.syncRegularOnly === true;
    const regularCandidate = (attendance.regularHours || 0) > 0 || status === 'HADIR' || status === 'PARTIAL IN';
    const overtimeCandidate = (attendance.overtimeHours || 0) > 0;

    let units = 0;

    if ((attendance.isAnnualLeave === true || attendance.isSickLeave === true) && !onlyOvertime) {
        units += 1;
    } else if (!onlyOvertime && !attendance.skipRegular && regularCandidate) {
        units += 1;
    }

    if (!syncRegularOnly && !attendance.skipOvertime && overtimeCandidate) {
        units += 1;
    }

    return Math.max(1, units);
}

function buildAttendanceWorkItems(employees, metadata = {}) {
    const items = [];

    (employees || []).forEach((employee, employeeIndex) => {
        const entries = attendanceEntries(employee);
        const key = employeeAssignmentKey(employee) || `__employee_${employeeIndex}`;

        if (entries.length === 0) {
            items.push({
                employee,
                employeeIndex,
                key,
                date: null,
                attendance: null,
                weight: 1
            });
            return;
        }

        entries.forEach(([date, attendance], dateIndex) => {
            items.push({
                employee,
                employeeIndex,
                key,
                date,
                attendance,
                dateIndex,
                weight: estimateAttendanceWork(attendance, metadata)
            });
        });
    });

    return items;
}

function calculateActualWindowCount(requestedWindows, maxWindows, workItemCount) {
    const requested = parsePositiveInt(requestedWindows, 1);
    const max = parsePositiveInt(maxWindows, DEFAULT_MAX_WINDOWS);
    const available = Math.max(1, parsePositiveInt(workItemCount, 1));
    return Math.max(1, Math.min(requested, max, available));
}

function cloneEmployeeForPartition(employee) {
    return {
        ...employee,
        Attendance: {}
    };
}

function sortEmployeeAttendance(employee) {
    if (!employee?.Attendance || typeof employee.Attendance !== 'object') return employee;

    const sortedAttendance = {};
    Object.keys(employee.Attendance).sort().forEach((date) => {
        sortedAttendance[date] = employee.Attendance[date];
    });

    return {
        ...employee,
        Attendance: sortedAttendance
    };
}

function addWorkItemToPartition(partition, item) {
    const partitionKey = item.key || `__employee_${item.employeeIndex}`;
    let employee = partition.byKey.get(partitionKey);

    if (!employee) {
        employee = cloneEmployeeForPartition(item.employee);
        partition.byKey.set(partitionKey, employee);
        partition.employees.push(employee);
    }

    if (item.date) {
        employee.Attendance[item.date] = item.attendance;
        partition.attendanceCount += 1;
    } else {
        employee.Attendance = item.employee.Attendance || {};
    }

    partition.workUnits += Math.max(1, item.weight || 1);
}

function buildWindowRunPlan({ data, requestedWindows, maxWindows = DEFAULT_MAX_WINDOWS, tabsPerWindow = DEFAULT_TABS_PER_WINDOW }) {
    const employees = getEmployeeList(data);
    const workItems = buildAttendanceWorkItems(employees, data?.metadata || {});
    const actualWindows = calculateActualWindowCount(requestedWindows, maxWindows, workItems.length);

    const partitions = Array.from({ length: actualWindows }, () => ({
        employees: [],
        byKey: new Map(),
        workUnits: 0,
        attendanceCount: 0
    }));

    const sortedItems = [...workItems].sort((a, b) => {
        if ((b.weight || 0) !== (a.weight || 0)) return (b.weight || 0) - (a.weight || 0);
        if (a.employeeIndex !== b.employeeIndex) return a.employeeIndex - b.employeeIndex;
        return (a.date || '').localeCompare(b.date || '');
    });

    sortedItems.forEach((item) => {
        const target = partitions.reduce((best, partition, index) => {
            if (partition.workUnits < partitions[best].workUnits) return index;
            if (partition.workUnits === partitions[best].workUnits && partition.employees.length < partitions[best].employees.length) return index;
            return best;
        }, 0);

        addWorkItemToPartition(partitions[target], item);
    });

    return {
        requestedWindows: parsePositiveInt(requestedWindows, 1),
        actualWindows,
        tabsPerWindow,
        totalCapacity: actualWindows * tabsPerWindow,
        totalEmployees: employees.length,
        totalAttendanceRecords: workItems.filter((item) => item.date).length,
        partitions: partitions.map((partition) => ({
            employees: partition.employees.map(sortEmployeeAttendance),
            workUnits: partition.workUnits,
            attendanceCount: partition.attendanceCount
        }))
    };
}

function writeWindowDataFile(data, partition, runId, windowIndex, actualWindows, tabsPerWindow) {
    const dataDir = path.join(__dirname, 'testing_data');
    fs.mkdirSync(dataDir, { recursive: true });

    const filePath = path.join(dataDir, `_window_${runId}_${windowIndex + 1}.json`);
    const payload = createPartitionedData(data, partition.employees, {
        automation_window_index: windowIndex + 1,
        automation_window_count: actualWindows,
        tabs_per_window: tabsPerWindow,
        window_work_units: partition.workUnits,
        window_attendance_records: partition.attendanceCount
    });

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return filePath;
}

function parseRunnerEventLine(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
    try {
        const parsed = JSON.parse(trimmed);
        return parsed && parsed.event ? parsed : null;
    } catch (_) {
        return null;
    }
}

function forwardRunnerLine(line, windowIndex, windowCount) {
    if (!line.trim()) return;

    const event = parseRunnerEventLine(line);
    if (event) {
        const eventName = /^run\./.test(event.event) ? `window.${event.event}` : event.event;
        process.stdout.write(JSON.stringify({
            ...event,
            event: eventName,
            window_index: windowIndex,
            window_count: windowCount
        }) + '\n');
        return;
    }

    process.stdout.write(`[W${windowIndex + 1}] ${line.trim()}\n`);
}

function startWindowProcess({ windowIndex, windowCount, templateName, dataFilePath, partition, tabsPerWindow, env }) {
    emit('window.started', {
        window_index: windowIndex,
        window_count: windowCount,
        employee_count: partition.employees.length,
        attendance_count: partition.attendanceCount,
        work_units: partition.workUnits,
        tabs_per_window: tabsPerWindow
    });

    const child = spawn(process.execPath, [MULTI_TAB_RUNNER, templateName, dataFilePath], {
        cwd: __dirname,
        env: {
            ...env,
            MULTI_TAB_CONCURRENCY: String(tabsPerWindow),
            AUTOMATION_WINDOW_INDEX: String(windowIndex + 1),
            AUTOMATION_WINDOW_COUNT: String(windowCount)
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';

    child.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        lines.forEach((line) => forwardRunnerLine(line, windowIndex, windowCount));
    });

    child.stderr.on('data', (data) => {
        stderrBuffer += data.toString();
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() || '';
        lines.forEach((line) => {
            if (line.trim()) process.stderr.write(`[W${windowIndex + 1} ERR] ${line.trim()}\n`);
        });
    });

    return {
        child,
        done: new Promise((resolve) => {
            child.on('error', (error) => {
                emit('window.failed', {
                    window_index: windowIndex,
                    window_count: windowCount,
                    message: error.message
                });
                resolve({ windowIndex, code: 1, error: error.message });
            });

            child.on('close', (code) => {
                if (stdoutBuffer.trim()) forwardRunnerLine(stdoutBuffer, windowIndex, windowCount);
                if (stderrBuffer.trim()) process.stderr.write(`[W${windowIndex + 1} ERR] ${stderrBuffer.trim()}\n`);

                const payload = {
                    window_index: windowIndex,
                    window_count: windowCount,
                    code,
                    employee_count: partition.employees.length,
                    attendance_count: partition.attendanceCount
                };

                if (code === 0) emit('window.completed', payload);
                else emit('window.failed', payload);

                resolve({ windowIndex, code });
            });
        })
    };
}

async function runMultiWindow({ templateName, dataFilePath, requestedWindows, maxWindows, tabsPerWindow, startDelayMs }) {
    const data = loadJson(dataFilePath || DEFAULT_DATA_FILE);
    const plan = buildWindowRunPlan({ data, requestedWindows, maxWindows, tabsPerWindow });

    if (plan.totalEmployees === 0) {
        throw new Error('Data tidak memiliki employee untuk diproses.');
    }

    const runId = `${Date.now()}_${process.pid}`;
    const tempFiles = [];
    const running = [];

    console.log('[MultiWindow] Starting attendance automation');
    console.log(`[MultiWindow] Requested windows: ${plan.requestedWindows}`);
    console.log(`[MultiWindow] Actual windows: ${plan.actualWindows}`);
    console.log(`[MultiWindow] Tabs per window: ${plan.tabsPerWindow}`);
    console.log(`[MultiWindow] Total tab capacity: ${plan.totalCapacity}`);
    console.log(`[MultiWindow] Total attendance records: ${plan.totalAttendanceRecords}`);

    emit('multiwindow.started', {
        requested_windows: plan.requestedWindows,
        actual_windows: plan.actualWindows,
        tabs_per_window: plan.tabsPerWindow,
        total_capacity: plan.totalCapacity,
        employee_count: plan.totalEmployees,
        attendance_count: plan.totalAttendanceRecords
    });

    const killChildren = () => {
        running.forEach(({ child }) => {
            if (!child.killed) child.kill('SIGTERM');
        });
    };

    process.once('SIGINT', () => {
        killChildren();
        process.exit(130);
    });
    process.once('SIGTERM', () => {
        killChildren();
        process.exit(143);
    });

    try {
        for (let i = 0; i < plan.actualWindows; i++) {
            const partition = plan.partitions[i];
            const filePath = writeWindowDataFile(data, partition, runId, i, plan.actualWindows, plan.tabsPerWindow);
            tempFiles.push(filePath);

            console.log(`[MultiWindow] Window ${i + 1}: ${partition.employees.length} employee(s), ${partition.attendanceCount} attendance record(s), ${partition.workUnits} work unit(s)`);

            if (i > 0 && startDelayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, startDelayMs));
            }

            running.push(startWindowProcess({
                windowIndex: i,
                windowCount: plan.actualWindows,
                templateName,
                dataFilePath: filePath,
                partition,
                tabsPerWindow: plan.tabsPerWindow,
                env: process.env
            }));
        }

        const results = await Promise.all(running.map((item) => item.done));
        const failed = results.filter((result) => result.code !== 0);

        if (failed.length > 0) {
            emit('run.failed', {
                failed_windows: failed.length,
                window_count: plan.actualWindows,
                success: false
            });
            throw new Error(`${failed.length} window automation gagal.`);
        }

        emit('run.completed', {
            success: true,
            windows: plan.actualWindows,
            tabs_per_window: plan.tabsPerWindow,
            total_capacity: plan.totalCapacity,
            employees: plan.totalEmployees,
            attendance_records: plan.totalAttendanceRecords,
            total_processed: plan.totalEmployees
        });

        return { success: true, plan, results };
    } finally {
        tempFiles.forEach((filePath) => {
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (_) { /* ignore cleanup failures */ }
        });
    }
}

async function runFromCli() {
    require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

    const { templateName, dataFilePath } = resolveTemplateAndData();
    const requestedWindows = parsePositiveInt(
        process.env.AUTOMATION_WINDOWS || process.env.WINDOW_COUNT || process.env.AUTOMATION_INSTANCES,
        1
    );
    const maxWindows = parsePositiveInt(process.env.MAX_AUTOMATION_WINDOWS, DEFAULT_MAX_WINDOWS);
    const tabsPerWindow = parsePositiveInt(process.env.TABS_PER_WINDOW || process.env.MULTI_TAB_CONCURRENCY, DEFAULT_TABS_PER_WINDOW);
    const startDelayMs = parseNonNegativeInt(process.env.WINDOW_START_DELAY || process.env.ENGINE_START_DELAY, 500);

    try {
        await runMultiWindow({
            templateName,
            dataFilePath,
            requestedWindows,
            maxWindows,
            tabsPerWindow,
            startDelayMs
        });
        process.exit(0);
    } catch (error) {
        console.error('\nMulti-window runner failed:', error.message);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    runFromCli();
}

module.exports = {
    DEFAULT_MAX_WINDOWS,
    DEFAULT_TABS_PER_WINDOW,
    buildAttendanceWorkItems,
    buildWindowRunPlan,
    calculateActualWindowCount,
    estimateAttendanceWork,
    runFromCli,
    runMultiWindow
};
