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
const componentLoop = employeeLoop.params.steps.find(step => step.action === 'forEach' && step.params?.array === 'employee.components');
assert.equal(componentLoop.params.failOnError, true);
assert.equal(componentLoop.params.recoveryListUrl, 'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxADLists.aspx');
assert.equal(componentLoop.params.recoveryDetailUrl, 'frmPrTrxADDets.aspx');
const taskCodeInput = componentLoop.params.steps.find(step => step.action === 'typeInput' && step.params?.selector === '#MainContent_ddlTaskCode + input.ui-autocomplete-input');
assert.equal(taskCodeInput.params.value, '${component.adSearchKeyword}');
assert.equal(taskCodeInput.params.selectFirstOption, true);
assert.equal(employeeLoop.params.steps.some(step => step.comment === '═══ FORCE PAYROLL DOC DATE FOR THIS EMPLOYEE FORM ═══'), true);
assert.equal(componentLoop.params.steps.some(step => step.comment === '═══ VERIFY PAYROLL DOC DATE BEFORE ADD ═══'), true);
assert.equal(employeeLoop.params.steps.some(step => step.comment === '═══ VERIFY PAYROLL DOC DATE BEFORE SAVE ═══'), true);

(async () => {
const result = await runPayrollAutomation({
        dataFile: path.join(__dirname, 'testing_data', 'current_payroll_data.json'),
        dryRunOnly: true,
        headless: true,
        autoClose: true
    });

    assert.equal(result.success, true);
    assert.equal(result.phase, 'dry-run');
    assert.equal(result.employeeCount > 0, true);
    assert.equal(result.rowCount > 0, true);
    console.log('payroll-runner tests passed');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
