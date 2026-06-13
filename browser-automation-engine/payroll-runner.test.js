const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseArgs, runPayrollAutomation } = require('./payroll-runner');

assert.deepEqual(parseArgs([]), {
    templateName: 'payroll-ad-input',
    dataFile: path.join(__dirname, 'testing_data', 'current_payroll_data.json'),
    dryRunOnly: false,
    smokeBrowserOnly: false,
    rowLimit: 0,
    componentType: '',
    componentKey: '',
    engineId: 'payroll',
    headless: process.env.HEADLESS === 'true',
    autoClose: process.env.AUTO_CLOSE !== 'false'
});

assert.equal(parseArgs(['--dry-run']).dryRunOnly, true);
assert.equal(parseArgs(['--smoke-browser']).smokeBrowserOnly, true);
assert.equal(parseArgs(['--row-limit', '1']).rowLimit, 1);
assert.equal(parseArgs(['--component-type=Addition']).componentType, 'Addition');
assert.equal(parseArgs(['--component-key', 'masaKerja']).componentKey, 'masaKerja');
assert.equal(parseArgs(['--engine-id', 'payroll_2']).engineId, 'payroll_2');
assert.equal(parseArgs(['--headless']).headless, true);
assert.equal(parseArgs(['--no-headless']).headless, false);
assert.equal(parseArgs(['--keep-open']).autoClose, false);
assert.equal(parseArgs(['payroll-ad-input', 'testing_data/current_payroll_data.json']).templateName, 'payroll-ad-input');
assert.equal(parseArgs(['payroll-ad-input', 'testing_data/current_payroll_data.json']).dataFile, 'testing_data/current_payroll_data.json');
assert.equal(parseArgs(['testing_data/current_payroll_data.json']).templateName, 'payroll-ad-input');
assert.equal(parseArgs(['testing_data/current_payroll_data.json']).dataFile, 'testing_data/current_payroll_data.json');

const payrollTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, 'templates', 'payroll-ad-input.json'), 'utf8'));
const employeeLoop = payrollTemplate.steps.find(step => step.action === 'forEachProperty' && step.params?.object === 'employees');
const docDateStep = payrollTemplate.steps.find(step => step.comment === '═══ FORCE PAYROLL DOC DATE TO SELECTED PERIOD MONTH ═══');
assert.equal(docDateStep.action, 'executeJavascript');
assert.equal(docDateStep.params.script.includes('metadata.payrollDocDate'), true);
assert.equal(docDateStep.params.script.includes('Payroll DocDate month mismatch'), true);
assert.equal(docDateStep.params.script.includes('refusing to continue'), true);
assert.equal(employeeLoop.params.failOnError, true);
assert.equal(employeeLoop.params.recoveryListUrl, 'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxADLists.aspx');
assert.equal(employeeLoop.params.recoveryDetailUrl, 'frmPrTrxADDets.aspx');
const oneDocGuard = employeeLoop.params.steps.find(step => step.comment === '═══ HARD GUARD: ONE COMPONENT ONLY FOR ONE DOCID ═══');
assert.equal(oneDocGuard.action, 'executeJavascript');
assert.equal(oneDocGuard.params.script.includes('exactly one component per DocID'), true);
const employeeInput = employeeLoop.params.steps.find(step => step.action === 'typeInput' && step.params?.selector === '#MainContent_ddlEmployee + input.ui-autocomplete-input');
assert.equal(employeeInput.params.value, '${employee.ptrjId}');
assert.equal(employeeInput.params.slowUntilSingle, true);
assert.equal(employeeInput.params.slowValue, '${employee.ptrjId}');
assert.deepEqual(employeeInput.params.fallbackValues, ['${employee.employeeName}']);
const componentLoop = employeeLoop.params.steps.find(step => step.action === 'forEach' && step.params?.array === 'employee.components');
assert.equal(componentLoop, undefined);
const taskCodeInput = employeeLoop.params.steps.find(step => step.action === 'typeInput' && step.params?.selector === '#MainContent_ddlTaskCode + input.ui-autocomplete-input');
assert.equal(taskCodeInput.params.value, '${employee.components.0.adSearchKeyword}');
assert.equal(taskCodeInput.params.selectFirstOption, true);
assert.equal(taskCodeInput.params.slowUntilSingle, true);
assert.equal(taskCodeInput.params.slowValue, '${employee.components.0.componentName}');
assert.deepEqual(taskCodeInput.params.fallbackValues, [
    '${employee.components.0.sourceNames.0}',
    '${employee.components.0.adCodeDesc}'
]);
assert.equal(employeeLoop.params.steps.some(step => step.comment === '═══ FORCE PAYROLL DOC DATE FOR THIS EMPLOYEE FORM ═══'), true);
assert.equal(employeeLoop.params.steps.some(step => step.comment === '═══ VERIFY PAYROLL DOC DATE BEFORE ADD ═══'), true);
assert.equal(employeeLoop.params.steps.some(step => step.comment === '═══ VERIFY PAYROLL DOC DATE BEFORE SAVE ═══'), true);

const berasTemplatePath = path.join(__dirname, 'templates', 'payroll-beras-input-with-chargejob.json');
assert.equal(fs.existsSync(berasTemplatePath), true);
const berasTemplate = JSON.parse(fs.readFileSync(berasTemplatePath, 'utf8'));
const berasEmployeeLoop = berasTemplate.steps.find(step => step.action === 'forEachProperty' && step.params?.object === 'employees');
assert.equal(Boolean(berasEmployeeLoop), true);
const berasSteps = berasEmployeeLoop.params.steps;
const findRetryDimensionStepIndex = (condition, validationSelector) => berasSteps.findIndex(step =>
    step.action === 'if'
    && step.params?.condition === condition
    && step.params?.thenSteps?.some(inner =>
        inner.action === 'retryInputWithValidation'
        && inner.params?.validationSelector === validationSelector
    )
);
const getRetryDimensionParams = (index) => berasSteps[index].params.thenSteps.find(inner => inner.action === 'retryInputWithValidation').params;
const parseChargeJobIndex = berasSteps.findIndex(step => step.action === 'parseChargeJob');
const stationIndex = findRetryDimensionStepIndex('hasChargeJobPart2', '#MainContent_MultiDimAcc_reqValBlock');
const machineIndex = findRetryDimensionStepIndex('hasChargeJobPart3', '#MainContent_MultiDimAcc_reqValSubBlk');
const expenseIndex = findRetryDimensionStepIndex('hasChargeJobPart4', '#MainContent_MultiDimAcc_reqValExpCode');
const berasAmountIndex = berasSteps.findIndex(step => step.action === 'typeInput' && step.params?.selector === '#MainContent_txtAmount');
assert.equal(parseChargeJobIndex >= 0, true);
assert.equal(stationIndex > parseChargeJobIndex, true);
assert.equal(machineIndex > stationIndex, true);
assert.equal(expenseIndex > machineIndex, true);
assert.equal(berasAmountIndex > expenseIndex, true);
assert.deepEqual(getRetryDimensionParams(stationIndex), {
    selector: '.ui-autocomplete-input.CBOBox',
    index: 2,
    value: '${chargeJobPart2}',
    validationSelector: '#MainContent_MultiDimAcc_reqValBlock',
    maxRetries: 2,
    expectedFieldCount: '${expectedFieldCount}',
    forceInput: true,
    checkIfAlreadyFilled: false
});
assert.deepEqual(getRetryDimensionParams(machineIndex), {
    selector: '.ui-autocomplete-input.CBOBox',
    index: 3,
    value: '${chargeJobPart3}',
    validationSelector: '#MainContent_MultiDimAcc_reqValSubBlk',
    maxRetries: 2,
    expectedFieldCount: '${expectedFieldCount}',
    fallbackValue: 'LABOUR COST',
    fallbackSearchValue: 'LABOUR',
    forceInput: true,
    checkIfAlreadyFilled: false
});
assert.deepEqual(getRetryDimensionParams(expenseIndex), {
    selector: '.ui-autocomplete-input.CBOBox',
    index: 4,
    value: '${chargeJobPart4}',
    validationSelector: '#MainContent_MultiDimAcc_reqValExpCode',
    maxRetries: 2,
    expectedFieldCount: '${expectedFieldCount}',
    fallbackValue: 'LABOUR',
    forceInput: true,
    checkIfAlreadyFilled: false
});

(async () => {
const result = await runPayrollAutomation({
        dataFile: path.join(__dirname, 'testing_data', 'current_payroll_data.json'),
        dryRunOnly: true,
        headless: true,
        autoClose: true
    });

    assert.equal(result.success, true);
    assert.equal(result.phase, 'dry-run');
    assert.equal(result.employeeCount >= 0, true);
    assert.equal(result.rowCount >= 0, true);
    console.log('payroll-runner tests passed');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
