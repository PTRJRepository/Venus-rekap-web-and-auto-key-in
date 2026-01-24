# 🛡️ Automation Recovery & Resilience Guide

This system is built with a robust **Self-Healing Architecture** designed to handle crashes, network failures, and browser freezes automatically.

## 1. How Recovery Works

### 🔄 Auto-Restart (Watchdog)
The `parallel-runner.js` script monitors all running engines.
- **Crash Detection:** If a browser closes or the process dies, it is restarted immediately.
- **Freeze Detection:** If an engine stops responding for >60 seconds (Heartbeat timeout), it is forcefully killed and restarted.

### ⏭️ Skip-on-Failure (Data Resilience)
To ensure the automation finishes the bulk of the work ("abis bekerja konsisten"), the system uses a **State File** (`logs/state_engine_N.json`) to track progress.

1. **Mark Started:** Before touching an employee, the system records: `"index": 5, "status": "STARTED"`.
2. **Mark Done:** After success, it records: `"index": 5, "status": "COMPLETED"`.
3. **Crash Scenario:**
   - If the browser crashes on Employee #5, the state remains `"status": "STARTED"`.
   - On restart, the system sees Employee #5 was attempted but failed.
   - It **SKIPS** Employee #5 and resumes at Employee #6.

**Why?** This prevents the system from getting stuck in an infinite loop trying to process a "bad" record that causes crashes.

### ♻️ Browser Recycling
Every **20 employees**, the system proactively closes and re-opens the Chrome browser.
- **Purpose:** Frees up RAM and clears cache.
- **Benefit:** Prevents the "slowdown" that usually happens after automation runs for hours.

## 2. Managing Recovery State

The state files are located in: `browser-automation-engine/logs/`
- `state_engine_1.json`
- `state_engine_2.json`
- ...

### 📝 Viewing Progress
Open any state file to see the last processed index:
```json
{
  "timestamp": "2026-01-23T08:30:00.000Z",
  "loops": {
    "data.data": {
      "index": 45,
      "status": "COMPLETED",
      "timestamp": "..."
    }
  }
}
```

### 🔁 Resetting / Retrying
If you want to **re-process** skipped items or start over:
1. Stop the automation (`Ctrl + C`).
2. **Delete** the state files in the `logs/` folder.
3. Run the automation again. It will start from Index 0.

## 3. Configuration

You can tune the resilience settings in `parallel-runner.js`:

- `HEARTBEAT_TIMEOUT`: Time (ms) to wait before killing a frozen browser (Default: 60000 / 1 min).
- `MAX_RESTARTS`: Max times to restart a crashing engine before giving up (Default: 10).

## 4. Troubleshooting

**"The system keeps skipping an employee!"**
- This means that employee causes a crash every time. Check the source data for that employee (e.g. invalid characters in Name or ID).

**"The browser closes and opens frequently."**
- This is the **Recycling** feature (every 20 items). It is normal and intentional.
