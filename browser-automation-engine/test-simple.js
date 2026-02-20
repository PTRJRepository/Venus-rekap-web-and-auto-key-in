/**
 * Script untuk testing template baru yang sederhana
 * Penggunaan: node test-simple.js
 */

const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════');
console.log('  VERIFIKASI TEMPLATE SEDERHANA');
console.log('═══════════════════════════════════════════════════\n');

const templatesDir = path.join(__dirname, 'templates');
const requiredFiles = [
    'input-flow-simple.json',   // Template utama
    'template-flow.json',        // Login & navigasi
    '_core_input.json',          // Core input (reguler & overtime)
    '_charge_job_input.json',    // Charge job inputs
    '_leave_input.json'          // Annual & Sick leave
];

let allValid = true;

// 1. Cek file template
console.log('1. CHECKING TEMPLATE FILES...');
requiredFiles.forEach(file => {
    const filePath = path.join(templatesDir, file);
    const exists = fs.existsSync(filePath);
    const status = exists ? '✅' : '❌';
    console.log(`   ${status} ${file}`);
    if (!exists) allValid = false;
});

// 2. Validasi JSON structure
console.log('\n2. VALIDATING JSON STRUCTURE...');
requiredFiles.forEach(file => {
    const filePath = path.join(templatesDir, file);
    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const hasName = !!content.name;
        const hasSteps = Array.isArray(content.steps) && content.steps.length > 0;
        const status = (hasName && hasSteps) ? '✅' : '⚠️';
        console.log(`   ${status} ${file} - ${content.name || '(no name)'} (${content.steps?.length || 0} steps)`);
        if (!hasName || !hasSteps) allValid = false;
    } catch (err) {
        console.log(`   ❌ ${file} - INVALID JSON: ${err.message}`);
        allValid = false;
    }
});

// 3. Cek data file
console.log('\n3. CHECKING DATA FILE...');
const dataFile = path.join(__dirname, 'testing_data', 'test_simple.json');
try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const hasData = Array.isArray(data.data) && data.data.length > 0;
    const status = hasData ? '✅' : '⚠️';
    console.log(`   ${status} test_simple.json - ${data.data?.length || 0} employees`);
    if (!hasData) allValid = false;
} catch (err) {
    console.log(`   ❌ test_simple.json - ${err.message}`);
    allValid = false;
}

// 4. Cek include references
console.log('\n4. CHECKING INCLUDE REFERENCES...');
const mainTemplate = path.join(templatesDir, 'input-flow-simple.json');
try {
    const content = JSON.parse(fs.readFileSync(mainTemplate, 'utf8'));
    const includes = [];

    function findIncludes(steps, depth = 0) {
        if (depth > 10) return;
        steps.forEach(step => {
            if (step.action === 'include' && step.params?.template) {
                includes.push(step.params.template);
            }
            if (step.thenSteps) findIncludes(step.thenSteps, depth + 1);
            if (step.elseSteps) findIncludes(step.elseSteps, depth + 1);
            if (step.params?.steps) findIncludes(step.params.steps, depth + 1);
        });
    }

    findIncludes(content.steps || []);

    includes.forEach(template => {
        const filePath = path.join(templatesDir, template.endsWith('.json') ? template : `${template}.json`);
        const exists = fs.existsSync(filePath);
        const status = exists ? '✅' : '❌';
        console.log(`   ${status} ${template}`);
        if (!exists) allValid = false;
    });
} catch (err) {
    console.log(`   ❌ Error checking includes: ${err.message}`);
    allValid = false;
}

// 5. Summary
console.log('\n═══════════════════════════════════════════════════');
if (allValid) {
    console.log('  ✅ SEMUA FILE SUDAH SIAP!');
    console.log('  Jalankan: node index.js input-flow-simple');
} else {
    console.log('  ⚠️ ADA BEBERAPA FILE YANG PERLU DIPERBAIKI');
}
console.log('═══════════════════════════════════════════════════\n');

process.exit(allValid ? 0 : 1);
