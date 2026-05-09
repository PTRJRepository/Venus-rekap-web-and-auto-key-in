// ============================================================
// Playwright Automation Service
// Manages Playwright-based browser automation processes
// ============================================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Path to Playwright engine
const PLAYWRIGHT_ENGINE_PATH = path.join(
  __dirname,
  '../../browser-automation-engine-playwright/dist/cli.js'
);

// Payload directory
const PAYLOAD_DIR = path.join(
  __dirname,
  '../../browser-automation-engine-playwright/data/payloads'
);

// Ensure payload directory exists
if (!fs.existsSync(PAYLOAD_DIR)) {
  fs.mkdirSync(PAYLOAD_DIR, { recursive: true });
}

class PlaywrightAutomationService {
  constructor() {
    // Map of payloadId -> { process, status, progress, startedAt }
    this.activeProcesses = new Map();
    this.statusMap = new Map();
  }

  /**
   * Generate a unique payload ID
   */
  generatePayloadId() {
    return crypto.randomUUID();
  }

  /**
   * Run attendance automation
   */
  runAttendance(payloadData) {
    const { employees, data, headless } = payloadData;
    const { month, year } = data;

    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      throw new Error('Employees array is required');
    }

    const payload = {
      operation: 'attendance',
      type: 'attendance',
      headless: headless !== false, // default true
      division: 'ATTENDANCE',
      data: { month, year },
      employees,
    };

    return this._run('attendance', payload);
  }

  /**
   * Run payroll automation
   */
  runPayroll(payloadData) {
    const { employees, data, headless } = payloadData;
    const { period, components } = data;

    if (!components || !Array.isArray(components) || components.length === 0) {
      throw new Error('Components array is required');
    }

    const payload = {
      operation: 'payroll',
      type: 'payroll',
      headless: headless !== false,
      division: 'PAYROLL',
      data: { period, components },
      employees: employees || [],
    };

    return this._run('payroll', payload);
  }

  /**
   * Internal method to run automation
   */
  _run(operation, payload) {
    const payloadId = this.generatePayloadId();
    const payloadPath = path.join(PAYLOAD_DIR, `payload-${payloadId}.json`);

    // Save payload to file
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));

    console.log(`[PlaywrightAutomation] Starting ${operation} (payloadId: ${payloadId})`);

    // Spawn the Playwright runner process
    const proc = spawn('node', [PLAYWRIGHT_ENGINE_PATH, '--payload=' + payloadPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MILLWARE_URL: process.env.MILLWARE_URL || 'http://millwarep3.rebinmas.com:8003',
        MILLWARE_USERNAME: process.env.MILLWARE_USERNAME || 'adm075',
        MILLWARE_PASSWORD: process.env.MILLWARE_PASSWORD || 'adm075',
      },
    });

    // Track the process
    this.activeProcesses.set(payloadId, proc);
    this.statusMap.set(payloadId, {
      status: 'running',
      operation,
      progress: 0,
      total: payload.employees?.length || 0,
      completed: 0,
      failed: 0,
      currentEmployee: null,
      startedAt: Date.now(),
    });

    // Parse stdout JSON events
    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          this._handleEvent(payloadId, event);
        } catch {
          // Non-JSON line, ignore
        }
      }
    });

    // Log stderr
    proc.stderr.on('data', (chunk) => {
      console.error(`[Playwright Runner ${payloadId}]`, chunk.toString().trim());
    });

    // Handle process exit
    proc.on('close', (code) => {
      const current = this.statusMap.get(payloadId);
      if (current) {
        this.statusMap.set(payloadId, {
          ...current,
          status: code === 0 ? 'completed' : 'failed',
          completedAt: Date.now(),
        });
      }
      this.activeProcesses.delete(payloadId);

      // Cleanup payload file
      try {
        fs.unlinkSync(payloadPath);
      } catch {
        // File may already be cleaned up by cli.ts
      }

      console.log(`[PlaywrightAutomation] ${operation} ${payloadId} finished with code ${code}`);
    });

    proc.on('error', (err) => {
      console.error(`[PlaywrightAutomation] Process error ${payloadId}:`, err);
      const current = this.statusMap.get(payloadId);
      if (current) {
        this.statusMap.set(payloadId, {
          ...current,
          status: 'failed',
          error: err.message,
          completedAt: Date.now(),
        });
      }
      this.activeProcesses.delete(payloadId);
    });

    return {
      payloadId,
      operation,
      status: 'running',
      employeeCount: payload.employees?.length || 0,
    };
  }

  /**
   * Handle event from Playwright runner
   */
  _handleEvent(payloadId, event) {
    const current = this.statusMap.get(payloadId);
    if (!current) return;

    switch (event.type) {
      case 'start':
        this.statusMap.set(payloadId, {
          ...current,
          total: event.totalEmployees,
        });
        break;

      case 'row.complete':
        this.statusMap.set(payloadId, {
          ...current,
          progress: event.progress,
          total: event.total,
          currentEmployee: event.employee,
          completed: current.completed + (event.status === 'success' ? 1 : 0),
          failed: current.failed + (event.status === 'failed' ? 1 : 0),
          lastError: event.status === 'failed' ? event.error : current.lastError,
        });
        break;

      case 'complete':
        this.statusMap.set(payloadId, {
          ...current,
          status: event.success ? 'completed' : 'failed',
          progress: event.total,
          completed: event.completed,
          failed: event.failed,
          completedAt: Date.now(),
        });
        break;

      case 'error':
        console.error(`[PlaywrightAutomation] Error event ${payloadId}:`, event.error);
        break;

      default:
        // Log other events for debugging
        console.log(`[PlaywrightAutomation] Event ${event.type}:`, JSON.stringify(event));
    }
  }

  /**
   * Get status of a running automation
   */
  getStatus(payloadId) {
    const status = this.statusMap.get(payloadId);
    if (!status) {
      return { status: 'not_found' };
    }

    return {
      ...status,
      // Calculate duration
      duration: status.completedAt
        ? status.completedAt - status.startedAt
        : Date.now() - status.startedAt,
    };
  }

  /**
   * Stop a running automation
   */
  stop(payloadId) {
    const proc = this.activeProcesses.get(payloadId);
    if (proc) {
      console.log(`[PlaywrightAutomation] Stopping ${payloadId}`);
      proc.kill('SIGTERM');

      const current = this.statusMap.get(payloadId);
      if (current) {
        this.statusMap.set(payloadId, {
          ...current,
          status: 'stopped',
          stoppedAt: Date.now(),
        });
      }

      this.activeProcesses.delete(payloadId);
      return true;
    }
    return false;
  }

  /**
   * List all active automations
   */
  listActive() {
    const list = [];
    for (const [payloadId, status] of this.statusMap) {
      list.push({ payloadId, ...status });
    }
    return list;
  }
}

// Export singleton instance
module.exports = new PlaywrightAutomationService();
