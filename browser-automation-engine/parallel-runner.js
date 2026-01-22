/**
 * Optimized Parallel Automation Runner - N ENGINES
 * Menjalankan N engine automation secara paralel dengan employee partitioning.
 * 
 * OPTIMIZATIONS:
 * - Configurable N instances (AUTOMATION_INSTANCES in .env)
 * - Employee-based partitioning only (date-based causes conflicts)
 * - Staggered start (ENGINE_START_DELAY ms between each)
 * - Separate Chrome user data directories (no profile lock)
 * - Cleanup stale browsers before starting
 * 
 * Usage: node parallel-runner.js [data-file]
 */

const AutomationEngine = require('./engine');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Default data file
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_data.json');
const dataFilePath = process.argv[2] || DEFAULT_DATA_FILE;

// Configurable settings from environment (set in backend/.env)
const AUTOMATION_INSTANCES = parseInt(process.env.AUTOMATION_INSTANCES || '2');
const ENGINE_START_DELAY = parseInt(process.env.ENGINE_START_DELAY || '2000');
const TEMPLATE_NAME = 'attendance-input-loop';

console.log(`📂 Using data file: ${dataFilePath}`);
console.log(`⚙️  Configuration: ${AUTOMATION_INSTANCES} instance(s), ${ENGINE_START_DELAY}ms delay`);

/**
 * Cleanup stale Chrome processes that use our automation profiles
 * This prevents ghost browsers from previous runs
 */
const cleanupStaleBrowsers = () => {
    try {
        // On Windows, check for Chrome processes using our profile directory
        const chromeDataPath = path.join(__dirname, 'chrome_data').replace(/\\/g, '\\\\');

        // Try to find and kill Chrome processes (Windows)
        if (process.platform === 'win32') {
            console.log('🧹 Checking for stale browser processes...');
            // Use taskkill to kill Chrome processes that might be using our profile
            // This is a best-effort cleanup - ignore errors
            try {
                execSync(`taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq automation*" 2>nul`, { stdio: 'ignore' });
            } catch (e) {
                // No matching processes - that's fine
            }
        }
        console.log('   ✓ Cleanup complete');
    } catch (error) {
        console.log('   ⚠️ Could not cleanup stale browsers (non-critical)');
    }
};

/**
 * Get engine options for a specific engine ID
 */
const getEngineOptions = (engineId) => ({
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.SLOW_MO || '0'),
    screenshot: process.env.SCREENSHOT !== 'false',
    inputBlocking: process.env.INPUT_BLOCKING === 'true',
    engineId: engineId,
    userDataDir: path.join(__dirname, 'chrome_data', `engine_${engineId}`)
});

/**
 * Load data from file
 */
const loadData = (filePath) => {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`Data file "${filePath}" tidak ditemukan.`);
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};

/**
 * Load base template
 */
const loadBaseTemplate = () => {
    const templatePath = path.join(__dirname, 'templates', `${TEMPLATE_NAME}.json`);
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template "${TEMPLATE_NAME}" tidak ditemukan.`);
    }
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
};

/**
 * Partition employees into N chunks
 * Each chunk contains a subset of employees for one engine to process
 */
const partitionEmployees = (employees, numPartitions) => {
    const partitions = [];
    for (let i = 0; i < numPartitions; i++) {
        partitions.push([]);
    }

    // Distribute employees round-robin to ensure even distribution
    employees.forEach((emp, index) => {
        partitions[index % numPartitions].push(emp);
    });

    return partitions;
};

/**
 * Count attendance records
 */
const countAttendanceRecords = (employees) => {
    return employees.reduce((total, emp) => {
        return total + Object.keys(emp.Attendance || {}).length;
    }, 0);
};

/**
 * Create engine template with specific employees
 */
const createEngineTemplate = (baseTemplate, data, employees, engineId) => {
    const templatesDir = path.join(__dirname, 'templates');
    const dataDir = path.join(__dirname, 'testing_data');

    // Ensure directories exist
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const partitionedData = { ...data, data: employees };

    // Write temporary data file
    const tempDataPath = path.join(dataDir, `_temp_engine_${engineId}.json`);
    fs.writeFileSync(tempDataPath, JSON.stringify(partitionedData, null, 2));

    // Write temporary template file
    const engineTemplate = { ...baseTemplate };
    engineTemplate.name = `${baseTemplate.name} - Engine ${engineId}`;
    engineTemplate.dataFile = `testing_data/_temp_engine_${engineId}.json`;

    const tempTemplatePath = path.join(templatesDir, `_temp_engine_${engineId}.json`);
    fs.writeFileSync(tempTemplatePath, JSON.stringify(engineTemplate, null, 2));

    return {
        templateName: `_temp_engine_${engineId}`,
        employeeCount: employees.length,
        attendanceCount: countAttendanceRecords(employees),
        employeeNames: employees.map(e => e.EmployeeName || e.PTRJEmployeeID || 'Unknown')
    };
};

/**
 * Ensure Chrome user data directories exist for N engines
 */
const ensureChromeDataDirs = (numEngines) => {
    const chromeDataDir = path.join(__dirname, 'chrome_data');
    if (!fs.existsSync(chromeDataDir)) {
        fs.mkdirSync(chromeDataDir, { recursive: true });
    }
    for (let i = 1; i <= numEngines; i++) {
        const engineDir = path.join(chromeDataDir, `engine_${i}`);
        if (!fs.existsSync(engineDir)) {
            fs.mkdirSync(engineDir, { recursive: true });
        }
    }
};

/**
 * Cleanup temporary files
 */
const cleanupTempFiles = (numEngines) => {
    const templatesDir = path.join(__dirname, 'templates');
    const dataDir = path.join(__dirname, 'testing_data');

    for (let i = 1; i <= numEngines; i++) {
        const tempTemplate = path.join(templatesDir, `_temp_engine_${i}.json`);
        const tempData = path.join(dataDir, `_temp_engine_${i}.json`);

        if (fs.existsSync(tempTemplate)) fs.unlinkSync(tempTemplate);
        if (fs.existsSync(tempData)) fs.unlinkSync(tempData);
    }
};

/**
 * Run a single engine
 */
const runEngine = async (engineId, templateName, options) => {
    const prefix = `[Engine ${engineId}]`;
    const engine = new AutomationEngine(options);

    try {
        console.log(`${prefix} 🚀 Starting...`);
        const startTime = Date.now();

        await engine.runTemplate(templateName);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`${prefix} ✅ Completed in ${duration}s!`);
        return { engineId, success: true, engine, duration };
    } catch (error) {
        console.error(`${prefix} ❌ Error:`, error.message);
        return { engineId, success: false, error: error.message, engine };
    }
};

/**
 * Run all engines in parallel with staggered start
 */
const runEnginesParallel = async (engines) => {
    const promises = [];

    for (let i = 0; i < engines.length; i++) {
        const { engineId, templateName, options, summary } = engines[i];

        if (i > 0 && ENGINE_START_DELAY > 0) {
            console.log(`⏳ Staggered start: waiting ${ENGINE_START_DELAY / 1000}s before Engine ${engineId}...`);
            await new Promise(r => setTimeout(r, ENGINE_START_DELAY));
        }

        console.log(`[Engine ${engineId}] 📊 ${summary.employeeCount} employees, ${summary.attendanceCount} records`);
        console.log(`[Engine ${engineId}] 👥 ${summary.employeeNames.slice(0, 2).join(', ')}${summary.employeeNames.length > 2 ? '...' : ''}`);

        promises.push(runEngine(engineId, templateName, options));
    }

    return Promise.all(promises);
};

/**
 * Main execution
 */
(async () => {
    console.log('\n' + '═'.repeat(60));
    console.log(`  🚀 PARALLEL AUTOMATION RUNNER`);
    console.log(`  ⚙️  Configured: ${AUTOMATION_INSTANCES} instance(s)`);
    console.log('  👥 Partition by EMPLOYEES');
    console.log('═'.repeat(60) + '\n');

    try {
        // 0. Cleanup any stale browser processes from previous runs
        cleanupStaleBrowsers();

        // 1. Load data
        const data = loadData(dataFilePath);
        const allEmployees = data.data || [];
        const totalAttendance = countAttendanceRecords(allEmployees);

        console.log(`📊 Total Employees: ${allEmployees.length}`);
        console.log(`📅 Total Attendance Records: ${totalAttendance}`);

        if (allEmployees.length === 0) {
            throw new Error('Data tidak memiliki employees.');
        }

        // 2. Load base template
        console.log(`📝 Loading template: ${TEMPLATE_NAME}`);
        const baseTemplate = loadBaseTemplate();

        // 3. Determine actual number of engines (can't have more engines than employees)
        // IMPORTANT: We can only run as many engines as we have employees
        const actualInstances = Math.min(AUTOMATION_INSTANCES, allEmployees.length);

        console.log(`\n🔢 Instance Calculation:`);
        console.log(`   - Configured instances: ${AUTOMATION_INSTANCES}`);
        console.log(`   - Available employees: ${allEmployees.length}`);
        console.log(`   - Will launch: ${actualInstances} browser(s)`);

        if (actualInstances < AUTOMATION_INSTANCES) {
            console.log(`   ⚠️  Reduced from ${AUTOMATION_INSTANCES} to ${actualInstances} (not enough employees)`);
        }

        // 4. ONLY create Chrome dirs for engines we will actually use
        ensureChromeDataDirs(actualInstances);

        // 5. Partition employees and create engine configs
        const partitions = partitionEmployees(allEmployees, actualInstances);
        const engines = [];

        console.log(`\n📋 ${actualInstances === 1 ? 'SINGLE' : 'PARALLEL'} MODE: ${actualInstances} engine(s)...`);

        for (let i = 0; i < actualInstances; i++) {
            const engineId = i + 1;
            const employees = partitions[i];

            if (employees.length === 0) continue; // Skip empty partitions

            const info = createEngineTemplate(baseTemplate, data, employees, engineId);
            console.log(`   Engine ${engineId}: ${info.employeeCount} employees, ${info.attendanceCount} records`);

            engines.push({
                engineId,
                templateName: info.templateName,
                options: getEngineOptions(engineId),
                summary: info
            });
        }

        // Validate: engines count should match what we expect
        if (engines.length !== actualInstances) {
            console.log(`\n⚠️  WARNING: Expected ${actualInstances} engines but created ${engines.length} (some partitions may be empty)`);
        }

        console.log(`\n✅ Created ${engines.length} engine(s) for ${allEmployees.length} employees`);

        // 6. Run engines
        console.log('\n' + '─'.repeat(60));
        console.log(`🏃 Starting ${engines.length} browser(s)...`);
        console.log('   (Only browsers with employees will launch)')
        console.log('─'.repeat(60) + '\n');

        const startTime = Date.now();
        const results = await runEnginesParallel(engines);
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

        // 7. Summary
        console.log('\n' + '═'.repeat(60));
        console.log('  📊 EXECUTION SUMMARY');
        console.log('═'.repeat(60));

        results.forEach(r => {
            const status = r.success ? '✅ SUCCESS' : '❌ FAILED';
            const duration = r.duration ? ` (${r.duration}s)` : '';
            console.log(`  Engine ${r.engineId}: ${status}${duration}`);
            if (!r.success) {
                console.log(`    Error: ${r.error}`);
            }
        });

        const allSuccess = results.every(r => r.success);
        console.log(`\n  ⏱️  Total Time: ${totalDuration}s`);
        console.log(allSuccess ? '  ✅ ALL ENGINES COMPLETED!' : '  ⚠️  Some engines failed.');
        console.log('═'.repeat(60) + '\n');

        // 8. Handle exit
        if (process.env.AUTO_CLOSE === 'true') {
            console.log('🔒 Closing browsers...');
            for (const r of results) {
                if (r.engine?.closeBrowser) await r.engine.closeBrowser();
            }
            process.exit(allSuccess ? 0 : 1);
        } else {
            console.log('⏰ Browsers tetap terbuka. Tekan Ctrl+C untuk menutup.\n');
            await new Promise(() => { });
        }

    } catch (error) {
        console.error('\n💥 Fatal Error:', error.message);
        cleanupTempFiles(AUTOMATION_INSTANCES);
        process.exit(1);
    }
})();
