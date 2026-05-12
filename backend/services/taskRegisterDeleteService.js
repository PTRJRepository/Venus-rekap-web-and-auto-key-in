/**
 * Task Register Delete Service
 * Backend service untuk prepare dan trigger OT record deletion automation
 * 
 * Flow:
 * 1. Backend menerima request deletion (mode, docIds, employeeIds, dateRange)
 * 2. Simpan delete data ke testing_data/current_delete_data.json
 * 3. Spawn delete-ot-runner.js process
 * 4. Track progress via heartbeat files
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ENGINE_DIR = path.resolve(__dirname, '../../browser-automation-engine');
const DATA_DIR = path.join(ENGINE_DIR, 'testing_data');
const DELETE_RUNNER_SCRIPT = path.join(ENGINE_DIR, 'delete-ot-runner.js');

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
};

/**
 * Save delete request data to JSON file for the runner
 */
const saveDeleteData = async (options = {}) => {
    ensureDataDir();
    const {
        mode = 'all_docids',        // 'all_docids' | 'specific_docids' | 'selected_employees'
        docIds = [],
        employeeIds = [],
        startDate = null,
        endDate = null,
        category = 'ot',            // 'ot' | 'normal' | 'all'
        month = null,
        year = null
    } = options;

    const filePath = path.join(DATA_DIR, 'current_delete_data.json');
    const payload = {
        metadata: {
            mode,
            category,
            startDate,
            endDate,
            month,
            year,
            totalDocIds: docIds.length,
            totalEmployees: employeeIds.length,
            generatedAt: new Date().toISOString()
        },
        docIds,
        employeeIds
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    console.log(`[TaskRegisterDelete] Saved delete data to ${filePath}`);
    console.log(`  Mode: ${mode}, Category: ${category}, DocIds: ${docIds.length}`);
    return filePath;
};

/**
 * Get list of DocIds from Millware Task Register for a date range
 * (Optional helper - bisa juga dari list page browser automation)
 */
const getDocIds = async (startDate, endDate) => {
    // TODO: Query Millware database directly for DocId list
    // Alternative: use browser automation to parse frmPrTrxTaskRegisterList.aspx
    console.log(`[TaskRegisterDelete] getDocIds(${startDate}, ${endDate}) - not yet implemented`);
    return [];
};

/**
 * Get records detail for a specific DocId
 */
const getDocDetail = async (docId) => {
    // TODO: Query Millware database directly
    console.log(`[TaskRegisterDelete] getDocDetail(${docId}) - not yet implemented`);
    return { docId, records: [], totalOT: 0 };
};

/**
 * Start the delete OT automation process
 */
let currentProcess = null;

const startDeleteProcess = (options = {}) => {
    const engineCount = parseInt(options.engineCount || process.env.AUTOMATION_INSTANCES || '2');
    const headless = options.headless !== undefined ? options.headless : (process.env.HEADLESS === 'true');
    const env = {
        ...process.env,
        HEADLESS: String(headless),
        AUTO_CLOSE: process.env.AUTO_CLOSE || 'true'
    };

    console.log(`[TaskRegisterDelete] Starting delete runner: node ${DELETE_RUNNER_SCRIPT}`);
    console.log(`  Engines: ${engineCount}, Headless: ${headless}`);

    const child = spawn('node', [DELETE_RUNNER_SCRIPT], {
        env,
        cwd: ENGINE_DIR,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    currentProcess = child;

    child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => console.log(`[DeleteRunner] ${line}`));
    });

    child.stderr.on('data', (data) => {
        console.error(`[DeleteRunner ERROR] ${data.toString()}`);
    });

    child.on('exit', () => {
        currentProcess = null;
    });

    return child;
};

const stopDeleteProcess = () => {
    if (currentProcess) {
        console.log('[TaskRegisterDelete] Stopping process...');
        if (process.platform === 'win32') {
            try { require('child_process').exec(`taskkill /pid ${currentProcess.pid} /T /F`); } catch (e) {}
        } else {
            currentProcess.kill('SIGINT');
        }
        currentProcess = null;
        return true;
    }
    return false;
};

const isDeleteRunning = () => currentProcess !== null;

module.exports = {
    saveDeleteData,
    getDocIds,
    getDocDetail,
    startDeleteProcess,
    stopDeleteProcess,
    isDeleteRunning
};