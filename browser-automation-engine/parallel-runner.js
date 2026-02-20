/**
 * Optimized Parallel Automation Runner - N ENGINES (Resilient Version)
 * Menjalankan N engine automation secara paralel dengan employee partitioning.
 *
 * FEATURES:
 * - Configurable N instances (AUTOMATION_INSTANCES in .env)
 * - Employee-based partitioning with dynamic load balancing
 * - Staggered start with adaptive delay
 * - Separate Chrome user data directories
 * - RESILIENCE: Watchdog process monitors heartbeats and restarts stuck/crashed instances
 * - SCALING: Optimized for 5+ instances with resource management
 *
 * Usage: node parallel-runner.js [data-file]
 */

const fs = require('fs');
const path = require('path');
const { fork, execSync } = require('child_process');
const os = require('os');

// ==================== DISTRIBUTED LOCKING ====================
/**
 * Simple file-based distributed locking mechanism
 * Mencegah race conditions saat multiple instances mengakses file yang sama
 */
class DistributedLock {
    constructor(lockName, lockDir) {
        this.lockName = lockName;
        this.lockDir = lockDir || path.join(__dirname, 'locks');
        this.lockFile = path.join(this.lockDir, `${lockName}.lock`);
        this.lockId = `${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.acquired = false;

        // Ensure lock directory exists
        if (!fs.existsSync(this.lockDir)) {
            fs.mkdirSync(this.lockDir, { recursive: true });
        }
    }

    /**
     * Try to acquire lock with timeout
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<boolean>} true if lock acquired
     */
    async acquire(timeoutMs = 30000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                // Try to create lock file exclusively
                const lockData = {
                    id: this.lockId,
                    pid: process.pid,
                    timestamp: Date.now()
                };

                fs.writeFileSync(this.lockFile, JSON.stringify(lockData), { flag: 'wx' });
                this.acquired = true;
                console.log(`🔒 Lock acquired: ${this.lockName} (${this.lockId})`);
                return true;
            } catch (e) {
                // Lock file exists, check if it's stale
                try {
                    const data = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
                    const staleTime = 60000; // 60 seconds stale timeout

                    if (Date.now() - data.timestamp > staleTime) {
                        // Lock is stale, try to break it
                        console.log(`⚠️  Breaking stale lock: ${this.lockName}`);
                        fs.unlinkSync(this.lockFile);
                        continue; // Retry acquiring
                    }
                } catch (readError) {
                    // Can't read lock file, try to delete and retry
                    try { fs.unlinkSync(this.lockFile); } catch (deleteError) { }
                }
            }

            // Wait before retry
            await new Promise(r => setTimeout(r, 100));
        }

        console.error(`❌ Failed to acquire lock: ${this.lockName} (timeout ${timeoutMs}ms)`);
        return false;
    }

    /**
     * Release the lock
     */
    release() {
        if (this.acquired) {
            try {
                // Only remove if we own the lock
                const data = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
                if (data.id === this.lockId) {
                    fs.unlinkSync(this.lockFile);
                    console.log(`🔓 Lock released: ${this.lockName}`);
                }
            } catch (e) {
                console.log(`⚠️  Lock already removed or invalid: ${this.lockName}`);
            }
            this.acquired = false;
        }
    }

    /**
     * Execute function with lock held
     * @param {Function} fn - Function to execute
     * @param {number} timeoutMs - Lock acquisition timeout
     * @returns {Promise<any>} Result of function
     */
    async withLock(fn, timeoutMs = 30000) {
        const acquired = await this.acquire(timeoutMs);
        if (!acquired) {
            throw new Error(`Failed to acquire lock: ${this.lockName}`);
        }

        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

// Default data file
const DEFAULT_DATA_FILE = path.join(__dirname, 'testing_data', 'current_data.json');
const dataFilePath = process.argv[2] || DEFAULT_DATA_FILE;

// ==================== CONFIGURATION ====================
// Read from environment variables with sensible defaults
const AUTOMATION_INSTANCES = parseInt(process.env.AUTOMATION_INSTANCES || '3');
const ENGINE_START_DELAY = parseInt(process.env.ENGINE_START_DELAY || '500');
const HEARTBEAT_TIMEOUT = parseInt(process.env.HEARTBEAT_TIMEOUT || '120000');
const MAX_RESTARTS = parseInt(process.env.MAX_ENGINE_RESTARTS || '10');
const TEMPLATE_NAME = 'attendance-input-loop';
const HEADLESS = process.env.HEADLESS === 'true';
const MAX_MEMORY_MB = parseInt(process.env.CHROME_MEMORY_LIMIT || '0');

// ==================== RESOURCE CALCULATION ====================
// Calculate optimal instance count based on available resources
const getTotalMemoryMB = () => Math.round(os.totalmem() / 1024 / 1024);
const getFreeMemoryMB = () => Math.round(os.freemem() / 1024 / 1024);
const getCpuCount = () => os.cpus().length;

// Auto-adjust instance count if needed
const calculateOptimalInstances = (requestedInstances, employeeCount, attendanceCount) => {
    const cpuCount = getCpuCount();
    const freeMemMB = getFreeMemoryMB();

    // Estimate memory needed per instance (headless ~300MB, non-headless ~800MB)
    const memPerInstance = HEADLESS ? 300 : 800;
    const maxByMemory = Math.floor(freeMemMB * 0.7 / memPerInstance); // Use 70% of free memory

    // Limit based on CPU cores (1.5 instances per core for headless, 1 for non-headless)
    const maxByCpu = HEADLESS ? Math.floor(cpuCount * 1.5) : cpuCount;

    // IMPORTANT: Use attendance count for limiting, NOT employee count
    // This allows splitting 1 employee's attendance across multiple instances
    const minAttendancePerInstance = 10; // Minimum 10 attendance records per instance
    const maxByAttendance = Math.floor(attendanceCount / minAttendancePerInstance);

    // Take the minimum of all constraints
    const optimalInstances = Math.min(requestedInstances, maxByMemory, maxByCpu, maxByAttendance);

    // Ensure at least 1 instance
    return Math.max(1, optimalInstances);
};

// ==================== EVENT LISTENERS ====================
// Increase listeners to prevent MaxListenersExceededWarning
process.setMaxListeners(AUTOMATION_INSTANCES + 50);

// ==================== DIRECTORY SETUP ====================
const LOGS_DIR = path.join(__dirname, 'logs');
const STATE_DIR = path.join(__dirname, 'state');
const LOCKS_DIR = path.join(__dirname, 'locks');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
if (!fs.existsSync(LOCKS_DIR)) fs.mkdirSync(LOCKS_DIR, { recursive: true });

// ==================== LOGGING ====================
const logSystemInfo = () => {
    console.log('\n' + '═'.repeat(70));
    console.log('  🖥️  SYSTEM INFORMATION');
    console.log('═'.repeat(70));
    console.log(`  CPU Cores: ${getCpuCount()}`);
    console.log(`  Total Memory: ${getTotalMemoryMB()} MB`);
    console.log(`  Free Memory: ${getFreeMemoryMB()} MB`);
    console.log(`  Platform: ${os.platform()} ${os.release()}`);
    console.log('═'.repeat(70) + '\n');
};

const logConfig = (actualInstances, requestedInstances) => {
    console.log(`📂 Using data file: ${dataFilePath}`);
    console.log(`⚙️  Configuration:`);
    console.log(`   • Requested Instances: ${requestedInstances}`);
    if (actualInstances < requestedInstances) {
        console.log(`   • Actual Instances: ${actualInstances} (adjusted for resources/employees)`);
    } else {
        console.log(`   • Actual Instances: ${actualInstances}`);
    }
    console.log(`   • Headless Mode: ${HEADLESS ? '✅ ENABLED (recommended for 5+ instances)' : '❌ DISABLED'}`);
    console.log(`   • Start Delay: ${ENGINE_START_DELAY}ms`);
    console.log(`   • Heartbeat Timeout: ${HEARTBEAT_TIMEOUT / 1000}s`);
    console.log(`   • Max Restarts: ${MAX_RESTARTS}`);

    if (actualInstances >= 5 && !HEADLESS) {
        console.log(`\n⚠️  WARNING: Running ${actualInstances}+ instances WITHOUT headless mode!`);
        console.log(`    This may cause memory exhaustion. Consider setting HEADLESS=true in .env`);
    }

    if (actualInstances >= 10) {
        console.log(`\n⚠️  HIGH CONCURRENCY: Running ${actualInstances} instances.`);
        console.log(`    Ensure your system has adequate resources (16GB+ RAM recommended)`);
    }
};

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

    // BETTER LOAD BALANCING: Split attendance records when fewer employees than partitions
    if (employees.length <= numPartitions) {
        // Split each employee's attendance records across partitions
        employees.forEach(emp => {
            const attendanceKeys = Object.keys(emp.Attendance || {});
            const recordsPerPartition = Math.ceil(attendanceKeys.length / numPartitions);

            attendanceKeys.forEach((key, index) => {
                const partitionIndex = Math.floor(index / recordsPerPartition) % numPartitions;

                // Create a copy of the employee with only this partition's attendance
                const existingEmpInPartition = partitions[partitionIndex].find(e => e.EmployeeID === emp.EmployeeID);
                if (existingEmpInPartition) {
                    // Add attendance to existing employee in this partition
                    existingEmpInPartition.Attendance[key] = emp.Attendance[key];
                } else {
                    // Create new employee entry for this partition
                    partitions[partitionIndex].push({
                        ...emp,
                        Attendance: { [key]: emp.Attendance[key] }
                    });
                }
            });
        });
    } else {
        // Original logic for when we have more employees than partitions
        const withAttendanceCount = employees.map(emp => ({
            emp,
            count: Object.keys(emp.Attendance || {}).length
        }));

        // Sort by attendance count (descending) to distribute heavy workloads first
        withAttendanceCount.sort((a, b) => b.count - a.count);

        // Distribute using round-robin to balance the load
        withAttendanceCount.forEach((item, index) => {
            partitions[index % numPartitions].push(item.emp);
        });
    }

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
    console.log('\n' + '═'.repeat(70));
    console.log(`  🚀 PARALLEL AUTOMATION RUNNER (SCALABLE TO N+ INSTANCES)`);
    console.log('═'.repeat(70));

    // Log system information
    logSystemInfo();

    try {
        cleanupStaleBrowsers();

        const data = loadData(dataFilePath);
        const allEmployees = data.data || [];

        if (allEmployees.length === 0) throw new Error('Data tidak memiliki employees.');

        const baseTemplate = loadBaseTemplate();
        const totalAttendanceRecords = countAttendanceRecords(allEmployees);

        // ==================== RESOURCE-AWARE INSTANCE CALCULATION ====================
        const requestedInstances = AUTOMATION_INSTANCES;
        const actualInstances = calculateOptimalInstances(requestedInstances, allEmployees.length, totalAttendanceRecords);

        // Log configuration
        logConfig(actualInstances, requestedInstances);

        // Log adjustment details
        if (actualInstances < requestedInstances) {
            console.log(`\n📊 Instance Adjustment Details:`);
            console.log(`   • Total Attendance Records: ${totalAttendanceRecords} (limits instances)`);
            console.log(`   • Employee Count: ${allEmployees.length}`);
            console.log(`   • Max by Memory: ${Math.floor(getFreeMemoryMB() * 0.7 / (HEADLESS ? 300 : 800))} instances`);
            console.log(`   • Max by CPU: ${HEADLESS ? Math.floor(getCpuCount() * 1.5) : getCpuCount()} instances`);
            console.log(`   • Min Attendance per Instance: 10 records`);
            console.log(`   • Final: Using ${actualInstances} instance(s) for optimal performance`);
        }

        // CLEANUP old temp files BEFORE creating new ones
        console.log(`\n🧹 Cleaning up stale temp files from previous runs...`);
        cleanupTempFiles(requestedInstances); // Clean up to max configured, not actual

        ensureChromeDataDirs(actualInstances);

        const partitions = partitionEmployees(allEmployees, actualInstances);
        const engines = [];

        console.log(`
📋 Preparing ${actualInstances} engine(s) with optimized workload distribution...
`);

        for (let i = 0; i < actualInstances; i++) {
            const engineId = i + 1;
            const employees = partitions[i];
            if (employees.length === 0) continue; // Skip if partition is empty

            const info = createEngineTemplate(baseTemplate, data, employees, engineId);
            const attendanceCount = countAttendanceRecords(employees);
            const empNames = employees.map(e => e.EmployeeName || e.PTRJEmployeeID || 'Unknown').join(', ');

            engines.push({
                engineId,
                templateName: info.templateName,
                options: getEngineOptions(engineId),
                summary: info
            });

            console.log(`   • Engine ${engineId}: ${employees.length} employee(s), ${attendanceCount} attendance records`);
            console.log(`     Employees: ${empNames}`);
        }

        console.log('');

        // Run with Watchdog
        const startTime = Date.now();
        const results = await runWatchdog(engines);
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

        // Summary
        console.log('\n' + '═'.repeat(70));
        console.log('  📊 EXECUTION SUMMARY');
        console.log('═'.repeat(70));

        let totalRestarts = 0;
        results.forEach(w => {
            const statusIcon = w.status === 'completed' ? '✅' : '❌';
            console.log(`  Engine ${w.config.engineId}: ${statusIcon} ${w.status.toUpperCase().padEnd(20)} (Restarts: ${w.restarts})`);
            totalRestarts += w.restarts;
        });

        const allSuccess = results.every(w => w.status === 'completed');
        const successRate = ((results.filter(w => w.status === 'completed').length / results.length) * 100).toFixed(0);

        console.log('  ' + '─'.repeat(70));
        console.log(`  Total Restarts: ${totalRestarts}`);
        console.log(`  Success Rate: ${successRate}%`);
        console.log(`  Total Time: ${totalDuration}s`);
        console.log('═'.repeat(70));

        if (process.env.AUTO_CLOSE === 'true') {
            process.exit(allSuccess ? 0 : 1);
        } else {
            console.log('\n⏰ Process finished. Press Ctrl+C to exit.');
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
