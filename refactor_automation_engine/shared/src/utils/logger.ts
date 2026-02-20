/**
 * Logger utility for the automation engine
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface LoggerConfig {
  level: LogLevel;
  enableTimestamp: boolean;
  enableColors: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',    // Cyan
  info: '\x1b[32m',     // Green
  warn: '\x1b[33m',     // Yellow
  error: '\x1b[31m',    // Red
};

const RESET = '\x1b[0m';

/**
 * Logger class for structured logging
 */
export class Logger {
  private context: string;
  private level: LogLevel;
  private enableTimestamp: boolean;
  private enableColors: boolean;

  constructor(
    context: string,
    options: Partial<LoggerConfig> = {}
  ) {
    this.context = context;
    this.level = options.level ?? 'info';
    this.enableTimestamp = options.enableTimestamp ?? true;
    this.enableColors = options.enableColors ?? true;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Record<string, unknown>): Logger {
    return new Logger(this.context, {
      level: this.level,
      enableTimestamp: this.enableTimestamp,
      enableColors: this.enableColors,
    });
  }

  /**
   * Set the logging level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current logging level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Check if a level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  /**
   * Format a log entry
   */
  private format(entry: LogEntry): string {
    const parts: string[] = [];

    if (this.enableTimestamp) {
      const date = new Date(entry.timestamp);
      const time = date.toISOString();
      parts.push(`[${time}]`);
    }

    const levelStr = entry.level.toUpperCase().padEnd(5);
    if (this.enableColors) {
      parts.push(`${COLORS[entry.level]}[${levelStr}]${RESET}`);
    } else {
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
  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    const entry: LogEntry = {
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
  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    const entry: LogEntry = {
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
  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    const entry: LogEntry = {
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
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    const entry: LogEntry = {
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
  group(label: string): void {
    console.group(`[${this.context}] ${label}`);
  }

  /**
   * Log a group end
   */
  groupEnd(): void {
    console.groupEnd();
  }

  /**
   * Log a divider
   */
  divider(char: string = '-', length: number = 50): void {
    console.log(char.repeat(length));
  }
}

/**
 * Pre-configured loggers for different modules
 */
export const loggers = {
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
export function createLogger(context: string, options?: Partial<LoggerConfig>): Logger {
  return new Logger(context, options);
}

export default Logger;
