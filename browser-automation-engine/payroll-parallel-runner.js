const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { validatePayrollPayload } = require('./payroll-dry-runner');

const DEFAULT_TEMPLATE = 'payroll-ad-input';
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_payroll_data.json');
const PAYROLL_RUNNER = path.join(__dirname, 'payroll-runner.js');

const parseArgs = (argv = process.argv.slice(2)) => {
    const args = {
        templateName: DEFAULT_TEMPLATE,
        dataFile: DEFAULT_DATA_FILE,
        workers: Math.max(1, parseInt(process.env.PAYROLL_TABS || process.env.AUTOMATION_INSTANCES || '5', 10) || 5),
        headless: process.env.HEADLESS === 'true',
        dryRunOnly: false,
        isolateRows: false,
        componentType: '',
        componentKey: '',
        rowLimit: 0,
        excludeRows: []
    };

    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--workers' || arg === '--tabs') {
            args.workers = Math.max(1, parseInt(argv[++i] || '5', 10) || 5);
        } else if (arg.startsWith('--workers=') || arg.startsWith('--tabs=')) {
            args.workers = Math.max(1, parseInt(arg.split('=')[1] || '5', 10) || 5);
        } else if (arg === '--dry-run') {
            args.dryRunOnly = true;
        } else if (arg === '--isolate-rows' || arg === '--one-row-per-worker') {
            args.isolateRows = true;
        } else if (arg === '--template') {
            args.templateName = argv[++i] || DEFAULT_TEMPLATE;
        } else if (arg.startsWith('--template=')) {
            args.templateName = arg.split('=')[1] || DEFAULT_TEMPLATE;
        } else if (arg === '--headless') {
            args.headless = true;
        } else if (arg === '--no-headless') {
            args.headless = false;
        } else if (arg === '--component-type') {
            args.componentType = argv[++i] || '';
        } else if (arg.startsWith('--component-type=')) {
            args.componentType = arg.split('=')[1] || '';
        } else if (arg === '--component-key') {
            args.componentKey = argv[++i] || '';
        } else if (arg.startsWith('--component-key=')) {
            args.componentKey = arg.split('=')[1] || '';
        } else if (arg === '--row-limit') {
            args.rowLimit = Math.max(0, parseInt(argv[++i] || '0', 10) || 0);
        } else if (arg.startsWith('--row-limit=')) {
            args.rowLimit = Math.max(0, parseInt(arg.split('=')[1] || '0', 10) || 0);
        } else if (arg === '--exclude-row') {
            args.excludeRows.push(argv[++i] || '');
        } else if (arg.startsWith('--exclude-row=')) {
            args.excludeRows.push(arg.split('=')[1] || '');
        } else {
            positional.push(arg);
        }
    }

    if (positional[0]) {
        if (positional[0].endsWith('.json') || positional[0].includes('\\') || positional[0].includes('/')) {
            args.dataFile = positional[0];
        } else {
            args.templateName = positional[0];
            if (positional[1]) args.dataFile = positional[1];
        }
    }
    return args;
};

const componentPassesFilter = (component, args) => {
    if (args.componentType && String(component.type || '').toLowerCase() !== String(args.componentType).toLowerCase()) return false;
    if (args.componentKey && String(component.componentKey || '').toLowerCase() !== String(args.componentKey).toLowerCase()) return false;
    return true;
};

const isExcludedRow = (employee, component, excludeRows = []) => {
    const actual = [
        employee.ptrjId || '',
        component.adCode || '',
        component.venusAmount || ''
    ].map(value => String(value).trim().toUpperCase()).join(':');
    return excludeRows.some(row => String(row || '').trim().toUpperCase() === actual);
};

const filterPayload = (payload, args) => {
    let remaining = args.rowLimit || Infinity;
    const employees = [];

    for (const employee of payload.employees || []) {
        const components = [];
        for (const component of employee.components || []) {
            if (!componentPassesFilter(component, args)) continue;
            if (isExcludedRow(employee, component, args.excludeRows)) continue;
            if (remaining <= 0) break;
            components.push(component);
            remaining -= 1;
        }
        if (components.length) employees.push({ ...employee, components });
        if (remaining <= 0) break;
    }

    return { ...payload, employees };
};

const splitPayloadToSingleComponentRecords = (payload) => {
    const employees = [];

    for (const employee of payload.employees || []) {
        for (const component of employee.components || []) {
            employees.push({
                ...employee,
                recordKey: employee.recordKey || [
                    employee.ptrjId || employee.employeeId || employee.employeeName || '',
                    component.componentKey || '',
                    component.adCode || '',
                    component.venusAmount || ''
                ].join(':'),
                components: [component]
            });
        }
    }

    return {
        ...payload,
        metadata: {
            ...(payload.metadata || {}),
            totalEmployees: employees.length,
            totalRecords: employees.length,
            totalComponents: employees.length,
            oneDocPerComponent: true
        },
        employees
    };
};

const componentCount = (employee) => (employee.components || []).length || 1;

const partitionEmployees = (employees, workers) => {
    const partitions = Array.from({ length: workers }, () => []);
    const weights = Array.from({ length: workers }, () => 0);

    const sorted = [...employees].sort((a, b) => componentCount(b) - componentCount(a));
    for (const employee of sorted) {
        let target = 0;
        for (let i = 1; i < workers; i++) {
            if (weights[i] < weights[target]) target = i;
        }
        partitions[target].push(employee);
        weights[target] += componentCount(employee);
    }

    return partitions;
};

const buildPartitionPayload = (payload, employees, index, totalWorkers) => {
    const totalComponents = employees.reduce((sum, employee) => sum + (employee.components || []).length, 0);
    return {
        ...payload,
        metadata: {
            ...(payload.metadata || {}),
            totalEmployees: employees.length,
            totalRecords: employees.length,
            totalComponents,
            parallel: true,
            workerIndex: index,
            totalWorkers
        },
        employees
    };
};

const writePartitionFiles = (payload, partitions) => {
    const tempDir = path.join(__dirname, 'testing_data');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    return partitions.map((employees, index) => {
        const workerIndex = index + 1;
        const workerPayload = buildPartitionPayload(payload, employees, workerIndex, partitions.length);
        const file = path.join(tempDir, `_payroll_worker_${workerIndex}.json`);
        fs.writeFileSync(file, JSON.stringify(workerPayload, null, 2), 'utf8');
        return {
            workerIndex,
            file,
            employeeCount: employees.length,
            componentCount: workerPayload.metadata.totalComponents
        };
    });
};

const runWorker = (partition, args) => new Promise((resolve) => {
    const runnerArgs = [
        args.headless ? '--headless' : '--no-headless',
        '--auto-close',
        '--engine-id',
        `payroll_${partition.workerIndex}`,
        args.templateName || DEFAULT_TEMPLATE,
        partition.file
    ];

    const child = spawn(process.execPath, [PAYROLL_RUNNER, ...runnerArgs], {
        cwd: __dirname,
        env: {
            ...process.env,
            HEADLESS: args.headless ? 'true' : 'false',
            AUTO_CLOSE: 'true'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', data => {
        data.toString().split(/\r?\n/).filter(Boolean).forEach(line => {
            console.log(`[PayrollTab${partition.workerIndex}] ${line}`);
        });
    });
    child.stderr.on('data', data => {
        data.toString().split(/\r?\n/).filter(Boolean).forEach(line => {
            console.error(`[PayrollTab${partition.workerIndex} ERR] ${line}`);
        });
    });
    child.on('close', code => resolve({ ...partition, code, success: code === 0 }));
});

const buildIsolatedRowBatches = (employees, workers) => {
    const batches = [];
    const workerCount = Math.max(1, parseInt(workers || 1, 10) || 1);

    for (let start = 0; start < employees.length; start += workerCount) {
        const partitions = Array.from({ length: workerCount }, (_, index) => {
            const employee = employees[start + index];
            return employee ? [employee] : [];
        });
        batches.push(partitions);
    }

    return batches;
};

const runPartitionFiles = async (partitionFiles, args) => {
    const runnable = partitionFiles.filter(p => p.componentCount > 0);
    return Promise.all(runnable.map(partition => runWorker(partition, args)));
};

const runPayrollParallel = async (args = parseArgs()) => {
    const dataFile = path.resolve(args.dataFile);
    const rawPayload = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const payload = splitPayloadToSingleComponentRecords(filterPayload(rawPayload, args));
    const validation = validatePayrollPayload(payload);

    if (!validation.success) {
        validation.errors.forEach(error => console.error(`ERROR ${error}`));
        return { success: false, phase: 'validate', validation };
    }

    const totalComponents = payload.employees.reduce((sum, employee) => sum + (employee.components || []).length, 0);
    const partitions = partitionEmployees(payload.employees, args.workers);
    const partitionFiles = writePartitionFiles(payload, partitions);

    console.log('='.repeat(70));
    console.log('PAYROLL PARALLEL RUNNER');
    console.log('='.repeat(70));
    console.log(`Template: ${args.templateName || DEFAULT_TEMPLATE}`);
    console.log(`Data file: ${dataFile}`);
    console.log(`Workers/tabs: ${args.workers}`);
    console.log(`Isolate rows: ${args.isolateRows ? 'true' : 'false'}`);
    console.log(`Headless: ${args.headless ? 'true' : 'false'}`);
    console.log(`Employees: ${payload.employees.length}`);
    console.log(`Rows: ${totalComponents}`);

    if (args.isolateRows) {
        const batches = buildIsolatedRowBatches(payload.employees, args.workers);
        console.log(`Batches: ${batches.length} (${args.workers} worker slot(s) per batch, max 1 row per worker)`);

        if (args.dryRunOnly) {
            return {
                success: true,
                phase: 'dry-run',
                batches: batches.map((batch, index) => ({
                    batchIndex: index + 1,
                    partitions: batch.map((employees, workerIndex) => ({
                        workerIndex: workerIndex + 1,
                        employeeCount: employees.length,
                        componentCount: employees.reduce((sum, employee) => sum + (employee.components || []).length, 0)
                    }))
                }))
            };
        }

        const allResults = [];
        for (let index = 0; index < batches.length; index += 1) {
            console.log(`Batch ${index + 1}/${batches.length}: starting`);
            const files = writePartitionFiles(payload, batches[index]);
            files.forEach(partition => {
                console.log(`Batch ${index + 1} Tab ${partition.workerIndex}: ${partition.employeeCount} employees, ${partition.componentCount} rows`);
            });
            const results = await runPartitionFiles(files, args);
            allResults.push(...results.map(result => ({ ...result, batchIndex: index + 1 })));
            const failedInBatch = results.filter(result => !result.success);
            if (failedInBatch.length > 0) {
                console.log(`Batch ${index + 1}/${batches.length}: ${failedInBatch.length} worker(s) failed`);
            } else {
                console.log(`Batch ${index + 1}/${batches.length}: completed`);
            }
        }

        const failed = allResults.filter(result => !result.success);
        return {
            success: failed.length === 0,
            phase: 'automation',
            results: allResults,
            failed
        };
    }

    partitionFiles.forEach(partition => {
        console.log(`Tab ${partition.workerIndex}: ${partition.employeeCount} employees, ${partition.componentCount} rows`);
    });

    if (args.dryRunOnly) {
        return { success: true, phase: 'dry-run', partitions: partitionFiles };
    }

    const results = await runPartitionFiles(partitionFiles, args);
    const failed = results.filter(result => !result.success);
    return {
        success: failed.length === 0,
        phase: 'automation',
        results,
        failed
    };
};

if (require.main === module) {
    runPayrollParallel(parseArgs())
        .then(result => {
            console.log(result.success ? 'PAYROLL PARALLEL COMPLETED' : 'PAYROLL PARALLEL FAILED');
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error(`PAYROLL PARALLEL ERROR: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        });
}

module.exports = {
    DEFAULT_TEMPLATE,
    parseArgs,
    partitionEmployees,
    filterPayload,
    splitPayloadToSingleComponentRecords,
    buildIsolatedRowBatches,
    runPayrollParallel
};
