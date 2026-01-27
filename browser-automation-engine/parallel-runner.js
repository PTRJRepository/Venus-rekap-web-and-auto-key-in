/**
 * Optimized Parallel Automation Runner - N ENGINES (Resilient Version)
 * Menjalankan N engine automation secara paralel dengan employee partitioning.
 * 
 * FEATURES:
 * - Configurable N instances (AUTOMATION_INSTANCES in .env)
 * - Employee-based partitioning
 * - Staggered start
 * - Separate Chrome user data directories
 * - RESILIENCE: Watchdog process monitors heartbeats and restarts stuck/crashed instances
 * 
 * Usage: node parallel-runner.js [data-file]
 */

const fs = require('fs');
const path = require('path');
const { fork, execSync } = require('child_process');

// Default data file
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_data.json');
const dataFilePath = process.argv[2] || DEFAULT_DATA_FILE;

// Configurable settings
const AUTOMATION_INSTANCES = parseInt(process.env.AUTOMATION_INSTANCES || '2');
// Smart Stagger: If instances > 5, increase delay to prevent CPU choke.
// If explicitly set in env, use that. Otherwise, calculate.
let defaultDelay = 5000;
if (AUTOMATION_INSTANCES > 10) defaultDelay = 8000; // Slower start for many instances
if (AUTOMATION_INSTANCES <= 5) defaultDelay = 3000; // Faster start for few

const ENGINE_START_DELAY = parseInt(process.env.ENGINE_START_DELAY || defaultDelay.toString());
const HEARTBEAT_TIMEOUT = 60000; // 60 seconds (1 minute) max silence
const MAX_RESTARTS = 10; // Prevent infinite restart loops
const TEMPLATE_NAME = 'attendance-input-loop';

// Increase listeners to prevent MaxListenersExceededWarning
// (Each worker attaches listeners to process)
process.setMaxListeners(AUTOMATION_INSTANCES + 20);

// Directory Setup
const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

console.log(`📂 Using data file: ${dataFilePath}`);
console.log(`⚙️  Configuration: ${AUTOMATION_INSTANCES} instance(s), ${ENGINE_START_DELAY}ms stagger delay`);
console.log(`❤️  Watchdog: ${HEARTBEAT_TIMEOUT / 1000}s heartbeat timeout`);
if (AUTOMATION_INSTANCES > 10) {
    console.log(`⚠️  HIGH CONCURRENCY WARNING: You are running ${AUTOMATION_INSTANCES} instances.`);
    console.log(`    Recommendation: Ensure 'HEADLESS=true' in .env to prevent memory exhaustion.`);
}

// --- UTILS ---

const cleanupStaleBrowsers = () => {
    try {
        if (process.platform === 'win32') {
            console.log('🧹 Checking for stale browser processes...');
            try {
                execSync(`taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq automation*" 2>nul`, { stdio: 'ignore' });
            } catch (e) { }
        }
        console.log('   ✓ Cleanup complete');
    } catch (error) {
        console.log('   ⚠️ Could not cleanup stale browsers (non-critical)');
    }
};

const cleanupEngineProfile = (engineId) => {
    try {
        const profileDir = path.join(__dirname, 'chrome_data', `engine_${engineId}`);
        const lockFile = path.join(profileDir, 'SingletonLock');
        const lockSocket = path.join(profileDir, 'SingletonSocket'); // Linux/Mac

        if (fs.existsSync(lockFile)) {
            console.log(`🧹 [Manager] Removing stale lock file for Engine ${engineId}`);
            try { fs.unlinkSync(lockFile); } catch (e) { }
        }
        if (fs.existsSync(lockSocket)) {
            try { fs.unlinkSync(lockSocket); } catch (e) { }
        }
    } catch (e) {
        // Ignore errors if profile doesn't exist yet
    }
};

const getEngineOptions = (engineId) => ({
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.SLOW_MO || '0'),
    screenshot: process.env.SCREENSHOT !== 'false',
    inputBlocking: process.env.INPUT_BLOCKING === 'true',
    engineId: engineId,
    userDataDir: path.join(__dirname, 'chrome_data', `engine_${engineId}`)
});

const loadData = (filePath) => {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
    if (!fs.existsSync(fullPath)) throw new Error(`Data file "${filePath}" tidak ditemukan.`);
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};

const loadBaseTemplate = () => {
    const templatePath = path.join(__dirname, 'templates', `${TEMPLATE_NAME}.json`);
    if (!fs.existsSync(templatePath)) throw new Error(`Template "${TEMPLATE_NAME}" tidak ditemukan.`);
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
};

const partitionEmployees = (employees, numPartitions) => {
    const partitions = [];
    for (let i = 0; i < numPartitions; i++) partitions.push([]);
    employees.forEach((emp, index) => partitions[index % numPartitions].push(emp));
    return partitions;
};

const countAttendanceRecords = (employees) => {
    return employees.reduce((total, emp) => total + Object.keys(emp.Attendance || {}).length, 0);
};

const createEngineTemplate = (baseTemplate, data, employees, engineId) => {
    const templatesDir = path.join(__dirname, 'templates');
    const dataDir = path.join(__dirname, 'testing_data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const partitionedData = { ...data, data: employees };
    const tempDataPath = path.join(dataDir, `_temp_engine_${engineId}.json`);
    fs.writeFileSync(tempDataPath, JSON.stringify(partitionedData, null, 2));

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

const ensureChromeDataDirs = (numEngines) => {
    const chromeDataDir = path.join(__dirname, 'chrome_data');
    if (!fs.existsSync(chromeDataDir)) fs.mkdirSync(chromeDataDir, { recursive: true });
    for (let i = 1; i <= numEngines; i++) {
        const engineDir = path.join(chromeDataDir, `engine_${i}`);
        if (!fs.existsSync(engineDir)) fs.mkdirSync(engineDir, { recursive: true });
    }
};

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

// --- WATCHDOG & WORKER MANAGEMENT ---

const startWorker = (engineConfig, workerState) => {
    const { engineId, templateName, options } = engineConfig;

    // Create worker config file
    const configPath = path.join(LOGS_DIR, `worker_config_${engineId}.json`);
    fs.writeFileSync(configPath, JSON.stringify({ engineId, templateName, options }, null, 2));

    // Reset heartbeat
    const heartbeatFile = path.join(LOGS_DIR, `heartbeat_engine_${engineId}.json`);
    if (fs.existsSync(heartbeatFile)) fs.unlinkSync(heartbeatFile);

    // CLEANUP STALE LOCKS BEFORE STARTING
    cleanupEngineProfile(engineId);

    console.log(`🚀 [Manager] Starting Engine ${engineId}... (Attempt ${workerState.restarts + 1})`);

    // Spawn process
    const child = fork(path.join(__dirname, 'worker.js'), [configPath], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });

    // Pipe output to console with prefix
    child.stdout.on('data', d => process.stdout.write(`[E${engineId}] ${d}`));
    child.stderr.on('data', d => process.stderr.write(`[E${engineId} ERR] ${d}`));

    workerState.process = child;
    workerState.status = 'running';
    workerState.startTime = Date.now();
    workerState.lastHeartbeat = Date.now();

    // Handle Exit
    child.on('exit', (code, signal) => {
        if (workerState.status === 'completed') return; // Already marked complete

        console.log(`⚠️ [Manager] Engine ${engineId} exited with code ${code}`);
        workerState.process = null;

        if (code === 0) {
            workerState.status = 'completed';
            console.log(`✅ [Manager] Engine ${engineId} finished successfully.`);
        } else {
            workerState.status = 'crashed';
            // It will be restarted by the watchdog loop
        }
    });

    return child;
};

const runWatchdog = async (engines) => {
    // Initialize workers state
    const workers = engines.map(cfg => ({
        config: cfg,
        process: null,
        status: 'pending',
        restarts: 0,
        startTime: 0,
        lastHeartbeat: 0
    }));

    // Start all workers (staggered)
    for (let i = 0; i < workers.length; i++) {
        if (i > 0 && ENGINE_START_DELAY > 0) {
            await new Promise(r => setTimeout(r, ENGINE_START_DELAY));
        }
        startWorker(workers[i].config, workers[i]);
    }

    // Monitoring Loop
    console.log(`
👀 [Watchdog] Monitoring ${workers.length} engines...
`);

    const checkInterval = 5000;
    let allDone = false;

    while (!allDone) {
        allDone = true; // Assume all are done until proven otherwise
        const now = Date.now();

        for (const w of workers) {
            if (w.status === 'completed') continue;

            allDone = false; // Found one not done

            // Check if crashed/pending (needs restart)
            if (w.status === 'crashed' || w.status === 'stuck') {
                if (w.restarts < MAX_RESTARTS) {
                    console.log(`🔄 [Watchdog] Restarting Engine ${w.config.engineId}...`);
                    w.restarts++;
                    startWorker(w.config, w);
                } else {
                    console.error(`❌ [Watchdog] Engine ${w.config.engineId} failed too many times (${w.restarts}). Giving up.`);
                    w.status = 'failed_permanently';
                }
                continue;
            }

            // Check Heartbeat (if running)
            if (w.status === 'running') {
                const heartbeatFile = path.join(LOGS_DIR, `heartbeat_engine_${w.config.engineId}.json`);
                try {
                    if (fs.existsSync(heartbeatFile)) {
                        const hb = JSON.parse(fs.readFileSync(heartbeatFile, 'utf8'));
                        w.lastHeartbeat = hb.timestamp;
                    }
                } catch (e) { /* Ignore errors reading heartbeat */ }

                const silenceDuration = now - w.lastHeartbeat;
                if (silenceDuration > HEARTBEAT_TIMEOUT) {
                    console.error(`⚠️ [Watchdog] Engine ${w.config.engineId} STUCK! (No heartbeat for ${Math.round(silenceDuration / 1000)}s)`);

                    // Kill process forcefully
                    if (w.process) {
                        try { w.process.kill('SIGKILL'); } catch (e) { w.process.kill(); } // Fallback to default kill
                        w.process = null;
                    }
                    w.status = 'stuck';
                    // Will be picked up by restart logic in next iteration
                }
            }
        }

        if (!allDone) {
            await new Promise(r => setTimeout(r, checkInterval));
        }
    }

    return workers;
};

// --- MAIN ---

(async () => {
    console.log('\n' + '═'.repeat(60));
    console.log(`  🚀 PARALLEL AUTOMATION RUNNER (RESILIENT)`);
    console.log('═'.repeat(60) + '\n');

    try {
        cleanupStaleBrowsers();

        const data = loadData(dataFilePath);
        const allEmployees = data.data || [];

        if (allEmployees.length === 0) throw new Error('Data tidak memiliki employees.');

        const baseTemplate = loadBaseTemplate();
        const actualInstances = Math.min(AUTOMATION_INSTANCES, allEmployees.length);

        ensureChromeDataDirs(actualInstances);

        const partitions = partitionEmployees(allEmployees, actualInstances);
        const engines = [];

        console.log(`
📋 Preparing ${actualInstances} engine(s)...
`);

        for (let i = 0; i < actualInstances; i++) {
            const engineId = i + 1;
            const employees = partitions[i];
            if (employees.length === 0) continue; // Skip if partition is empty

            const info = createEngineTemplate(baseTemplate, data, employees, engineId);
            engines.push({
                engineId,
                templateName: info.templateName,
                options: getEngineOptions(engineId),
                summary: info
            });
        }

        // Run with Watchdog
        const startTime = Date.now();
        const results = await runWatchdog(engines);
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('  📊 EXECUTION SUMMARY');
        console.log('═'.repeat(60));

        results.forEach(w => {
            const statusIcon = w.status === 'completed' ? '✅' : '❌';
            console.log(`  Engine ${w.config.engineId}: ${statusIcon} ${w.status.toUpperCase()} (Restarts: ${w.restarts})`);
        });

        const allSuccess = results.every(w => w.status === 'completed');
        console.log(`
  ⏱️  Total Time: ${totalDuration}s`);

        if (process.env.AUTO_CLOSE === 'true') {
            process.exit(allSuccess ? 0 : 1);
        } else {
            console.log('⏰ Process finished. Press Ctrl+C to exit.');
        }

    } catch (error) {
        console.error('\n💥 Fatal Error:', error.message);
        cleanupStaleBrowsers();
        process.exit(1);
    }
})();

// --- GRACEFUL SHUTDOWN ---
const handleExit = () => {
    console.log('\n🛑 Received termination signal. Cleaning up...');
    cleanupStaleBrowsers();
    process.exit(0);
};

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);
