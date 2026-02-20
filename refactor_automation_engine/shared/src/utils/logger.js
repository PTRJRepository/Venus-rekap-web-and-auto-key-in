"use strict";
/**
 * Logger utility for the automation engine
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loggers = exports.Logger = void 0;
exports.createLogger = createLogger;
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
const COLORS = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m', // Green
    warn: '\x1b[33m', // Yellow
    error: '\x1b[31m', // Red
};
const RESET = '\x1b[0m';
/**
 * Logger class for structured logging
 */
class Logger {
    constructor(context, options = {}) {
        this.context = context;
        this.level = options.level ?? 'info';
        this.enableTimestamp = options.enableTimestamp ?? true;
        this.enableColors = options.enableColors ?? true;
    }
    /**
     * Create a child logger with additional context
     */
    child(additionalContext) {
        return new Logger(this.context, {
            level: this.level,
            enableTimestamp: this.enableTimestamp,
            enableColors: this.enableColors,
        });
    }
    /**
     * Set the logging level
     */
    setLevel(level) {
        this.level = level;
    }
    /**
     * Get the current logging level
     */
    getLevel() {
        return this.level;
    }
    /**
     * Check if a level should be logged
     */
    shouldLog(level) {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
    }
    /**
     * Format a log entry
     */
    format(entry) {
        const parts = [];
        if (this.enableTimestamp) {
            const date = new Date(entry.timestamp);
            const time = date.toISOString();
            parts.push(`[${time}]`);
        }
        const levelStr = entry.level.toUpperCase().padEnd(5);
        if (this.enableColors) {
            parts.push(`${COLORS[entry.level]}[${levelStr}]${RESET}`);
        }
        else {
            parts.push(`[${levelStr}]`);
        }
        parts.push(`[${this.context}]`);
        parts.push(entry.message);
        if (entry.context && Object.keys(entry.context).length > 0) {
            parts.push(JSON.stringify(entry.context));
        }
        if (entry.error) {
            parts.push(`\n${entry.error.stack || entry.error.message}`);
        }
        return parts.join(' ');
    }
    /**
     * Log a debug message
     */
    debug(message, context) {
        if (!this.shouldLog('debug'))
            return;
        const entry = {
            level: 'debug',
            message,
            timestamp: Date.now(),
            context,
        };
        console.debug(this.format(entry));
    }
    /**
     * Log an info message
     */
    info(message, context) {
        if (!this.shouldLog('info'))
            return;
        const entry = {
            level: 'info',
            message,
            timestamp: Date.now(),
            context,
        };
        console.info(this.format(entry));
    }
    /**
     * Log a warning message
     */
    warn(message, context) {
        if (!this.shouldLog('warn'))
            return;
        const entry = {
            level: 'warn',
            message,
            timestamp: Date.now(),
            context,
        };
        console.warn(this.format(entry));
    }
    /**
     * Log an error message
     */
    error(message, error, context) {
        if (!this.shouldLog('error'))
            return;
        const entry = {
            level: 'error',
            message,
            timestamp: Date.now(),
            context,
            error,
        };
        console.error(this.format(entry));
    }
    /**
     * Log a group start
     */
    group(label) {
        console.group(`[${this.context}] ${label}`);
    }
    /**
     * Log a group end
     */
    groupEnd() {
        console.groupEnd();
    }
    /**
     * Log a divider
     */
    divider(char = '-', length = 50) {
        console.log(char.repeat(length));
    }
}
exports.Logger = Logger;
/**
 * Pre-configured loggers for different modules
 */
exports.loggers = {
    core: new Logger('Core'),
    engine: new Logger('Engine'),
    template: new Logger('Template'),
    action: new Logger('Action'),
    validator: new Logger('Validator'),
    provider: new Logger('Provider'),
    adapter: new Logger('Adapter'),
    database: new Logger('Database'),
    api: new Logger('API'),
};
/**
 * Create a logger for a specific module
 */
function createLogger(context, options) {
    return new Logger(context, options);
}
exports.default = Logger;
