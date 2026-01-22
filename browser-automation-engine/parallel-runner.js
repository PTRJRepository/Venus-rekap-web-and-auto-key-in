/**
 * Parallel Automation Runner
 * Menjalankan 2 engine automation secara paralel dengan data partitioning otomatis.
 * Data dibagi berdasarkan TANGGAL ATTENDANCE (bukan employee).
 * 
 * Usage: node parallel-runner.js <data-file>
 * Example: node parallel-runner.js testing_data/test_data.json
 */

const AutomationEngine = require('./engine');
const fs = require('fs');
const path = require('path');

// Default data file - use current_data.json for simplified workflow
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_data.json');

// Get data file from command line, or use default
const dataFilePath = process.argv[2] || DEFAULT_DATA_FILE;

// No longer require data file argument - use default if not provided
console.log(`📂 Using data file: ${dataFilePath}`);

// Engine options
const engineOptions = {
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.SLOW_MO || '0'),
    screenshot: process.env.SCREENSHOT !== 'false',
    inputBlocking: process.env.INPUT_BLOCKING === 'true' // Disabled by default - user can interact with browser
};

// Configurable delay between engine starts (in milliseconds)
// Higher delay = less chance of race conditions
const ENGINE_START_DELAY = parseInt(process.env.ENGINE_START_DELAY || '8000');

// Template name for attendance input
const TEMPLATE_NAME = 'attendance-input-loop';

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
 * Partition data by ATTENDANCE DATES (even/odd/all)
 * Each employee keeps all their info, but Attendance is split by date index
 * 'all' = no partitioning, returns all data
 */
const partitionByAttendanceDates = (data, partition) => {
    const partitionedData = {
        ...data,
        data: data.data.map(employee => {
            // Get all attendance dates sorted
            const attendanceEntries = Object.entries(employee.Attendance || {});
            attendanceEntries.sort((a, b) => a[0].localeCompare(b[0])); // Sort by date

            // Filter by index (even/odd) or return all
            const filteredEntries = attendanceEntries.filter((_, index) => {
                if (partition === 'all') return true; // No filtering
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

    return partitionedData;
};

/**
 * Count total attendance dates in data
 */
const countAttendanceDates = (data) => {
    let total = 0;
    data.data.forEach(emp => {
        total += Object.keys(emp.Attendance || {}).length;
    });
    return total;
};

/**
 * Get attendance dates list for display
 */
const getAttendanceDatesList = (data) => {
    const dates = [];
    data.data.forEach(emp => {
        Object.keys(emp.Attendance || {}).forEach(date => {
            if (!dates.includes(date)) dates.push(date);
        });
    });
    return dates.sort();
};

/**
 * Create engine template with partitioned data
 */
const createEngineTemplate = (baseTemplate, data, engineId, partition) => {
    const templatesDir = path.join(__dirname, 'templates');
    const dataDir = path.join(__dirname, 'testing_data');

    // Partition data by attendance dates
    const partitionedData = partitionByAttendanceDates(data, partition);

    // Count dates for this partition
    const dateCount = countAttendanceDates(partitionedData);
    const dates = getAttendanceDatesList(partitionedData);

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
        dateCount: dateCount,
        dates: dates
    };
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
 * Run a single engine with logging prefix
 */
const runEngine = async (engineId, templateName, options) => {
    const prefix = `[Engine ${engineId}]`;
    const engine = new AutomationEngine(options);

    try {
        console.log(`${prefix} 🚀 Starting...`);
        await engine.runTemplate(templateName);
        console.log(`${prefix} ✅ Completed successfully!`);
        return { engineId, success: true, engine };
    } catch (error) {
        console.error(`${prefix} ❌ Error:`, error.message);
        return { engineId, success: false, error: error.message };
    }
};

/**
 * Main execution
 */
(async () => {
    console.log('\n' + '═'.repeat(60));
    console.log('  🚀 PARALLEL AUTOMATION RUNNER - 2 ENGINES');
    console.log('  📅 Partition by ATTENDANCE DATES');
    console.log('═'.repeat(60) + '\n');

    try {
        // 1. Load data
        console.log(`📂 Loading data from: ${dataFilePath}`);
        const data = loadData(dataFilePath);

        const totalEmployees = data.data?.length || 0;
        const totalDates = countAttendanceDates(data);

        console.log(`📊 Total Employees: ${totalEmployees}`);
        console.log(`📅 Total Attendance Dates: ${totalDates}`);

        if (totalDates === 0) {
            throw new Error('Data tidak memiliki attendance dates.');
        }

        // 2. Load base template
        console.log(`📝 Loading base template: ${TEMPLATE_NAME}`);
        const baseTemplate = loadBaseTemplate();

        // 3. Create engine template 
        // SINGLE INSTANCE MODE: Using all data for Engine 1 only (no partitioning)
        console.log('\n📋 Single Instance Mode (Parallel Disabled)...');

        // Create a template with ALL data (no partition filter)
        const engine1Info = createEngineTemplate(baseTemplate, data, 1, 'all');

        // COMMENTED OUT: Engine 2 for parallel execution
        // const engine2Info = createEngineTemplate(baseTemplate, data, 2, 'odd');

        console.log(`\n   Engine 1: ${engine1Info.dateCount} dates (ALL DATA)`);
        console.log(`      Dates: ${engine1Info.dates.slice(0, 5).join(', ')}${engine1Info.dates.length > 5 ? '...' : ''}`);

        // COMMENTED OUT: Engine 2 display
        // console.log(`   Engine 2: ${engine2Info.dateCount} dates (index ganjil)`);
        // console.log(`      Dates: ${engine2Info.dates.slice(0, 5).join(', ')}${engine2Info.dates.length > 5 ? '...' : ''}`);

        // 4. Run engines
        console.log('\n' + '─'.repeat(60));
        console.log('🏃 Starting SINGLE engine execution...');
        console.log('─'.repeat(60) + '\n');

        const enginePromises = [];

        // Engine 1 - start with ALL data
        if (engine1Info.dateCount > 0) {
            console.log('[Engine 1] Starting with ALL data...');
            enginePromises.push(runEngine(1, engine1Info.templateName, engineOptions));
        }

        // COMMENTED OUT: Engine 2 parallel execution
        // if (engine2Info.dateCount > 0) {
        //     console.log(`[Engine 2] Waiting ${ENGINE_START_DELAY / 1000}s before start for isolation...`);
        //     await new Promise(r => setTimeout(r, ENGINE_START_DELAY));
        //     console.log('[Engine 2] Starting...');
        //     enginePromises.push(runEngine(2, engine2Info.templateName, engineOptions));
        // }

        // Wait for all engines
        const results = await Promise.all(enginePromises);

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('  📊 EXECUTION SUMMARY (SINGLE INSTANCE)');
        console.log('═'.repeat(60));

        results.forEach(r => {
            const status = r.success ? '✅ SUCCESS' : '❌ FAILED';
            console.log(`  Engine ${r.engineId}: ${status}`);
            if (!r.success) {
                console.log(`    Error: ${r.error}`);
            }
        });

        const allSuccess = results.every(r => r.success);
        if (allSuccess) {
            console.log('\n  ✅ ALL ENGINES COMPLETED SUCCESSFULLY!');
        } else {
            console.log('\n  ⚠️  Some engines failed.');
        }
        console.log('═'.repeat(60) + '\n');

        // Check if Auto-Close is enabled
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
            // Keep process alive
            console.log('⏰ Browsers tetap terbuka. Tekan Ctrl+C untuk menutup.\n');
            await new Promise(() => { });
        }

    } catch (error) {
        console.error('\n💥 Fatal Error:', error.message);
        cleanupTempFiles();
        process.exit(1);
    }
})();
