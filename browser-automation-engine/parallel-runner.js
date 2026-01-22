/**
 * Optimized Parallel Automation Runner - 2 ENGINES
 * Menjalankan 2 engine automation secara paralel dengan employee partitioning.
 * 
 * OPTIMIZATIONS:
 * - Employee-based partitioning (no collision risk)
 * - 2-second staggered start (minimal CPU spike)
 * - Separate Chrome user data directories (no profile lock)
 * - Per-engine progress tracking and crash recovery
 * 
 * Usage: node parallel-runner.js [data-file]
 * Example: node parallel-runner.js testing_data/test_data.json
 */

const AutomationEngine = require('./engine');
const fs = require('fs');
const path = require('path');

// Default data file
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_data.json');
const dataFilePath = process.argv[2] || DEFAULT_DATA_FILE;

console.log(`📂 Using data file: ${dataFilePath}`);

// Configurable settings from environment (set in backend/.env)
// AUTOMATION_INSTANCES: 1 = single browser, 2 = dual parallel browsers
const AUTOMATION_INSTANCES = parseInt(process.env.AUTOMATION_INSTANCES || '2');
const PARALLEL_MODE = AUTOMATION_INSTANCES >= 2;
const ENGINE_START_DELAY = parseInt(process.env.ENGINE_START_DELAY || '2000');
const TEMPLATE_NAME = 'attendance-input-loop';

console.log(`⚙️  Configuration: ${AUTOMATION_INSTANCES} instance(s), ${ENGINE_START_DELAY}ms delay`);

/**
 * Get engine options for a specific engine ID
 * Each engine gets its own Chrome user data directory to prevent profile locks
 */
const getEngineOptions = (engineId) => ({
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.SLOW_MO || '0'),
    screenshot: process.env.SCREENSHOT !== 'false',
    inputBlocking: process.env.INPUT_BLOCKING === 'true',
    engineId: engineId,
    // Separate user data dirs to prevent Chrome profile lock contention
    userDataDir: path.join(__dirname, 'chrome_data', `engine_${engineId}`)
});

/**
 * Load data from file
 */
const loadData = (filePath) => {
    const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(__dirname, filePath);

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
 * OPTIMIZED: Partition data by EMPLOYEES (not dates)
 * This is better for Venus website which is employee-centric
 * Each engine processes completely different employees = zero collision risk
 * 
 * @param {object} data - Full data object with data.data array of employees
 * @param {string} partition - 'firstHalf', 'secondHalf', or 'all'
 * @returns {object} - Data with only the partitioned employees
 */
const partitionByEmployee = (data, partition) => {
    const employees = data.data || [];

    if (partition === 'all') {
        return data;
    }

    const midpoint = Math.ceil(employees.length / 2);

    return {
        ...data,
        data: partition === 'firstHalf'
            ? employees.slice(0, midpoint)
            : employees.slice(midpoint)
    };
};

/**
 * Partition data by ATTENDANCE DATES (for single-employee scenarios)
 * When there's only 1 employee, we can still parallelize by splitting dates
 * 
 * @param {object} data - Full data object with single employee
 * @param {string} partition - 'even', 'odd', or 'all'
 * @returns {object} - Data with partitioned attendance dates
 */
const partitionByDate = (data, partition) => {
    if (partition === 'all' || !data.data || data.data.length === 0) {
        return data;
    }

    return {
        ...data,
        data: data.data.map(employee => {
            const attendanceEntries = Object.entries(employee.Attendance || {});
            attendanceEntries.sort((a, b) => a[0].localeCompare(b[0])); // Sort by date

            // Filter by index (even/odd)
            const filteredEntries = attendanceEntries.filter((_, index) => {
                return partition === 'even' ? index % 2 === 0 : index % 2 === 1;
            });

            // Rebuild Attendance object
            const filteredAttendance = {};
            filteredEntries.forEach(([date, value]) => {
                filteredAttendance[date] = value;
            });

            return {
                ...employee,
                Attendance: filteredAttendance
            };
        })
    };
};

/**
 * Count total attendance records in data
 */
const countAttendanceRecords = (data) => {
    let total = 0;
    (data.data || []).forEach(emp => {
        total += Object.keys(emp.Attendance || {}).length;
    });
    return total;
};

/**
 * Get summary info for display
 */
const getDataSummary = (data) => {
    const employees = data.data || [];
    const employeeNames = employees.map(e => e.EmployeeName || e.PTRJEmployeeID || 'Unknown');
    const attendanceCount = countAttendanceRecords(data);

    return {
        employeeCount: employees.length,
        employeeNames: employeeNames,
        attendanceCount: attendanceCount
    };
};
/**
 * Create engine template with partitioned data (by EMPLOYEE)
 */
const createEngineTemplate = (baseTemplate, data, engineId, partition) => {
    const templatesDir = path.join(__dirname, 'templates');
    const dataDir = path.join(__dirname, 'testing_data');

    // Ensure directories exist
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    // Partition data by employees
    const partitionedData = partitionByEmployee(data, partition);
    const summary = getDataSummary(partitionedData);

    // Write temporary data file for this engine
    const tempDataPath = path.join(dataDir, `_temp_engine_${engineId}.json`);
    fs.writeFileSync(tempDataPath, JSON.stringify(partitionedData, null, 2));

    // Create template for this engine
    const engineTemplate = { ...baseTemplate };
    engineTemplate.name = `${baseTemplate.name} - Engine ${engineId}`;
    engineTemplate.dataFile = `testing_data/_temp_engine_${engineId}.json`;

    // Write temporary template file
    const tempTemplatePath = path.join(templatesDir, `_temp_engine_${engineId}.json`);
    fs.writeFileSync(tempTemplatePath, JSON.stringify(engineTemplate, null, 2));

    return {
        templateName: `_temp_engine_${engineId}`,
        ...summary
    };
};

/**
 * Create engine template with partitioned data (by DATE)
 * Used when there's only 1 employee but we want 2 parallel instances
 */
const createEngineTemplateByDate = (baseTemplate, data, engineId, partition) => {
    const templatesDir = path.join(__dirname, 'templates');
    const dataDir = path.join(__dirname, 'testing_data');

    // Ensure directories exist
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    // Partition data by dates (even/odd)
    const partitionedData = partitionByDate(data, partition);
    const summary = getDataSummary(partitionedData);

    // Write temporary data file for this engine
    const tempDataPath = path.join(dataDir, `_temp_engine_${engineId}.json`);
    fs.writeFileSync(tempDataPath, JSON.stringify(partitionedData, null, 2));

    // Create template for this engine
    const engineTemplate = { ...baseTemplate };
    engineTemplate.name = `${baseTemplate.name} - Engine ${engineId} (Dates)`;
    engineTemplate.dataFile = `testing_data/_temp_engine_${engineId}.json`;

    // Write temporary template file
    const tempTemplatePath = path.join(templatesDir, `_temp_engine_${engineId}.json`);
    fs.writeFileSync(tempTemplatePath, JSON.stringify(engineTemplate, null, 2));

    return {
        templateName: `_temp_engine_${engineId}`,
        ...summary
    };
};

/**
 * Ensure Chrome user data directories exist
 */
const ensureChromeDataDirs = () => {
    const chromeDataDir = path.join(__dirname, 'chrome_data');
    if (!fs.existsSync(chromeDataDir)) {
        fs.mkdirSync(chromeDataDir, { recursive: true });
    }
    [1, 2].forEach(id => {
        const engineDir = path.join(chromeDataDir, `engine_${id}`);
        if (!fs.existsSync(engineDir)) {
            fs.mkdirSync(engineDir, { recursive: true });
        }
    });
};

/**
 * Cleanup temporary files
 */
const cleanupTempFiles = () => {
    const templatesDir = path.join(__dirname, 'templates');
    const dataDir = path.join(__dirname, 'testing_data');

    ['1', '2'].forEach(id => {
        const tempTemplate = path.join(templatesDir, `_temp_engine_${id}.json`);
        const tempData = path.join(dataDir, `_temp_engine_${id}.json`);

        if (fs.existsSync(tempTemplate)) fs.unlinkSync(tempTemplate);
        if (fs.existsSync(tempData)) fs.unlinkSync(tempData);
    });
};

/**
 * Run a single engine with logging prefix and progress tracking
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
 * Run engines in parallel with staggered start
 */
const runEnginesParallel = async (engines) => {
    const promises = [];

    for (let i = 0; i < engines.length; i++) {
        const { engineId, templateName, options, summary } = engines[i];

        if (i > 0 && ENGINE_START_DELAY > 0) {
            console.log(`⏳ Staggered start: waiting ${ENGINE_START_DELAY / 1000}s before Engine ${engineId}...`);
            await new Promise(r => setTimeout(r, ENGINE_START_DELAY));
        }

        console.log(`[Engine ${engineId}] 📊 Processing ${summary.employeeCount} employees, ${summary.attendanceCount} records`);
        console.log(`[Engine ${engineId}] 👥 Employees: ${summary.employeeNames.slice(0, 3).join(', ')}${summary.employeeNames.length > 3 ? '...' : ''}`);

        // Start engine asynchronously
        promises.push(runEngine(engineId, templateName, options));
    }

    return Promise.all(promises);
};

/**
 * Main execution
 */
(async () => {
    console.log('\n' + '═'.repeat(60));
    console.log(`  🚀 PARALLEL AUTOMATION RUNNER - ${PARALLEL_MODE ? '2 ENGINES' : 'SINGLE ENGINE'}`);
    console.log('  👥 Partition by EMPLOYEES (Zero Collision)');
    console.log('═'.repeat(60) + '\n');

    try {
        // 0. Ensure Chrome data directories exist
        ensureChromeDataDirs();

        // 1. Load data
        console.log(`📂 Loading data from: ${dataFilePath}`);
        const data = loadData(dataFilePath);
        const totalSummary = getDataSummary(data);

        console.log(`📊 Total Employees: ${totalSummary.employeeCount}`);
        console.log(`📅 Total Attendance Records: ${totalSummary.attendanceCount}`);

        if (totalSummary.employeeCount === 0) {
            throw new Error('Data tidak memiliki employees.');
        }

        // 2. Load base template
        console.log(`📝 Loading base template: ${TEMPLATE_NAME}`);
        const baseTemplate = loadBaseTemplate();

        // 3. Create engine templates
        const engines = [];

        if (PARALLEL_MODE && totalSummary.employeeCount >= 2) {
            // PARALLEL MODE (by EMPLOYEE): 2 engines with employee partitioning
            console.log('\n📋 PARALLEL MODE (by Employee): Partitioning employees between 2 engines...');

            const engine1Info = createEngineTemplate(baseTemplate, data, 1, 'firstHalf');
            const engine2Info = createEngineTemplate(baseTemplate, data, 2, 'secondHalf');

            console.log(`   Engine 1: ${engine1Info.employeeCount} employees, ${engine1Info.attendanceCount} records`);
            console.log(`   Engine 2: ${engine2Info.employeeCount} employees, ${engine2Info.attendanceCount} records`);

            engines.push({ engineId: 1, templateName: engine1Info.templateName, options: getEngineOptions(1), summary: engine1Info });
            engines.push({ engineId: 2, templateName: engine2Info.templateName, options: getEngineOptions(2), summary: engine2Info });
        } else if (PARALLEL_MODE && totalSummary.employeeCount === 1 && totalSummary.attendanceCount >= 2) {
            // PARALLEL MODE (by DATE): 1 employee but multiple dates - split by date
            console.log('\n📋 PARALLEL MODE (by Date): Single employee - partitioning dates between 2 engines...');

            const engine1Info = createEngineTemplateByDate(baseTemplate, data, 1, 'even');
            const engine2Info = createEngineTemplateByDate(baseTemplate, data, 2, 'odd');

            console.log(`   Engine 1: ${engine1Info.employeeCount} employees, ${engine1Info.attendanceCount} records (even dates)`);
            console.log(`   Engine 2: ${engine2Info.employeeCount} employees, ${engine2Info.attendanceCount} records (odd dates)`);

            engines.push({ engineId: 1, templateName: engine1Info.templateName, options: getEngineOptions(1), summary: engine1Info });
            engines.push({ engineId: 2, templateName: engine2Info.templateName, options: getEngineOptions(2), summary: engine2Info });
        } else {
            // SINGLE MODE: 1 engine with all data
            console.log('\n📋 SINGLE MODE: Processing all data with 1 engine...');

            const engine1Info = createEngineTemplate(baseTemplate, data, 1, 'all');
            console.log(`   Engine 1: ${engine1Info.employeeCount} employees, ${engine1Info.attendanceCount} records`);

            engines.push({ engineId: 1, templateName: engine1Info.templateName, options: getEngineOptions(1), summary: engine1Info });
        }

        // 4. Run engines
        console.log('\n' + '─'.repeat(60));
        console.log(`🏃 Starting ${engines.length} engine(s)...`);
        console.log('─'.repeat(60) + '\n');

        const startTime = Date.now();
        const results = await runEnginesParallel(engines);
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

        // 5. Summary
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
        if (allSuccess) {
            console.log('  ✅ ALL ENGINES COMPLETED SUCCESSFULLY!');
        } else {
            console.log('  ⚠️  Some engines failed.');
        }
        console.log('═'.repeat(60) + '\n');

        // 6. Handle cleanup/exit
        if (process.env.AUTO_CLOSE === 'true') {
            console.log('\n🔒 AUTO_CLOSE enabled. Closing browsers...');

            for (const r of results) {
                if (r.engine && typeof r.engine.closeBrowser === 'function') {
                    console.log(`   Closing Engine ${r.engineId}...`);
                    await r.engine.closeBrowser();
                }
            }

            console.log('👋 All done. Exiting.');
            process.exit(allSuccess ? 0 : 1);
        } else {
            console.log('⏰ Browsers tetap terbuka. Tekan Ctrl+C untuk menutup.\n');
            await new Promise(() => { });
        }

    } catch (error) {
        console.error('\n💥 Fatal Error:', error.message);
        cleanupTempFiles();
        process.exit(1);
    }
})();
