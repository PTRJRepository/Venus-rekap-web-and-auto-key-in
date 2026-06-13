const fs = require('fs');
const path = require('path');

const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_payroll_data.json');

const toNumber = (value) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
};

const componentIdentity = (employee, component) => [
    employee.ptrjId || employee.employeeId || employee.employeeName || '',
    component.componentKey || '',
    component.adCode || '',
    component.venusCompCode || '',
    component.venusAmount || 0
].join('|');

const metadataMonthMatchesDocDate = (metadata = {}) => {
    const month = String(metadata.month || '').padStart(2, '0');
    const docDate = String(metadata.payrollDocDate || '').trim();
    if (!month || !docDate) return true;
    const parts = docDate.split('/');
    return parts.length === 3 && parts[1] === month;
};

const validatePayrollPayload = (payload) => {
    const errors = [];
    const warnings = [];
    const rows = [];
    const seen = new Set();

    if (!payload || typeof payload !== 'object') {
        return {
            success: false,
            errors: ['Payload must be a JSON object'],
            warnings,
            rows
        };
    }

    if (!payload.metadata || typeof payload.metadata !== 'object') {
        errors.push('metadata is required');
    } else if (!metadataMonthMatchesDocDate(payload.metadata)) {
        errors.push(`metadata.payrollDocDate month must match metadata.month (${payload.metadata.month})`);
    }

    if (!Array.isArray(payload.employees)) {
        errors.push('employees must be an array');
        return { success: false, errors, warnings, rows };
    }

    payload.employees.forEach((employee, employeeIndex) => {
        const employeeLabel = employee.employeeName || employee.employeeId || `employees[${employeeIndex}]`;
        if (!employee.ptrjId || employee.ptrjId === '-') {
            errors.push(`${employeeLabel}: ptrjId is required`);
        }

        if (!Array.isArray(employee.components)) {
            errors.push(`${employeeLabel}: components must be an array`);
            return;
        }

        if (employee.components.length === 0) {
            warnings.push(`${employeeLabel}: no components to input`);
        }

        if (employee.components.length > 1) {
            errors.push(`${employeeLabel}: components must contain exactly one item for one DocID per record`);
        }

        employee.components.forEach((component, componentIndex) => {
            const rowLabel = `${employeeLabel}.components[${componentIndex}]`;
            const amount = toNumber(component.venusAmount);
            const key = componentIdentity(employee, component);

            if (seen.has(key)) {
                errors.push(`${rowLabel}: duplicate component ${key}`);
            }
            seen.add(key);

            if (!component.componentName) {
                errors.push(`${rowLabel}: componentName is required`);
            }

            if (!component.adCode) {
                errors.push(`${rowLabel}: adCode is required`);
            }

            if (amount <= 0) {
                errors.push(`${rowLabel}: venusAmount must be greater than 0`);
            }

            const componentKey = String(component.componentKey || '').toLowerCase();
            const requiresChargeJob = componentKey === 'beras'
                || (componentKey === 'lembur' && payload.metadata?.requiresChargeJob === true);
            if (requiresChargeJob && !String(employee.chargeJob || '').trim()) {
                errors.push(`${rowLabel}: chargeJob is required for ${componentKey} account dimensions`);
            }

            rows.push({
                employeeName: employee.employeeName || '',
                ptrjId: employee.ptrjId || '',
                componentKey: component.componentKey || '',
                componentName: component.componentName || '',
                adCode: component.adCode || '',
                amount
            });
        });
    });

    return {
        success: errors.length === 0,
        errors,
        warnings,
        rows
    };
};

const runPayrollDryRun = (dataFile = DEFAULT_DATA_FILE, options = {}) => {
    const resolvedFile = path.resolve(dataFile);
    const payload = options.payload || JSON.parse(fs.readFileSync(resolvedFile, 'utf8'));
    const validation = validatePayrollPayload(payload);

    if (!options.quiet) {
        console.log('='.repeat(70));
        console.log('PAYROLL AD LISTS DRY RUN');
        console.log('='.repeat(70));
        console.log(`Data file: ${resolvedFile}`);
        console.log(`Employees: ${payload.employees?.length || 0}`);
        console.log(`Rows: ${validation.rows.length}`);
        if (validation.warnings.length) {
            console.log(`Warnings: ${validation.warnings.length}`);
            validation.warnings.forEach(warning => console.log(`WARN ${warning}`));
        }
        if (validation.errors.length) {
            console.log(`Errors: ${validation.errors.length}`);
            validation.errors.forEach(error => console.log(`ERROR ${error}`));
        }
        validation.rows.forEach((row, index) => {
            console.log(`${String(index + 1).padStart(3, '0')}. ${row.ptrjId} ${row.employeeName} | ${row.componentName} | ${row.adCode} | ${row.amount}`);
        });
        console.log(validation.success ? 'DRY RUN OK' : 'DRY RUN FAILED');
    }

    return {
        ...validation,
        dataFile: resolvedFile,
        employeeCount: payload.employees?.length || 0,
        rowCount: validation.rows.length
    };
};

if (require.main === module) {
    try {
        const result = runPayrollDryRun(process.argv[2] || DEFAULT_DATA_FILE);
        process.exit(result.success ? 0 : 1);
    } catch (error) {
        console.error(`ERROR ${error.message}`);
        process.exit(1);
    }
}

module.exports = {
    metadataMonthMatchesDocDate,
    validatePayrollPayload,
    runPayrollDryRun
};
