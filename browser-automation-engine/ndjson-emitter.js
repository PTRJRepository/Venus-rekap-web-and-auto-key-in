/**
 * ndjson-emitter.js
 *
 * NDJSON (Newline Delimited JSON) event streaming for automation runners.
 * Each event is written as a separate JSON line to stdout.
 * Frontend can consume these via child_process.spawn stdout pipe.
 *
 * Based on "Auto Key In Refactor" pattern.
 *
 * Event reference:
 *   run.started          — Runner began
 *   preflight.duplicate  — Duplicate keys detected
 *   preflight.split      — Cross-tab employee split detected
 *   preflight.ok         — All preflight checks passed
 *   session.starting     — Browser session starting
 *   session.login.done    — Login completed
 *   session.reused       — Existing session restored
 *   session.saved        — Session saved to file
 *   tab.open.started     — Tab opening
 *   tab.open.done        — Tab form ready
 *   tab.assigned         — Employee range assigned to tab
 *   tab.progress         — Per-employee progress within tab
 *   row.started          — Employee processing started
 *   row.success          — Employee processed successfully
 *   row.failed           — Employee processing failed
 *   row.skipped          — Employee skipped (no action needed)
 *   tab.submit.started   — Tab submit started
 *   tab.submit.done      — Tab submit completed
 *   tab.submit.failed    — Tab submit failed
 *   tab.completed        — Tab fully done
 *   run.completed        — Runner finished successfully
 *   run.failed           — Runner finished with errors
 */

function ndjsonStringify(obj) {
    return JSON.stringify(obj) + '\n';
}

/**
 * Create an emit function bound to process.stdout.
 * All events are written as NDJSON lines.
 *
 * @param {boolean} [enabled=true] - Set to false to disable output (useful for testing)
 * @returns {function} emit(event, data)
 */
function createEmitter(enabled = true) {
    return function emit(event, data = {}) {
        if (!enabled) return;
        const line = ndjsonStringify({
            event,
            ts: new Date().toISOString(),
            ...data
        });
        process.stdout.write(line);
    };
}

const emit = createEmitter(process.env.NDJSON_EVENTS !== 'false');

module.exports = {
    createEmitter,
    emit
};
