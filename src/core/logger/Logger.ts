import * as fs from 'fs';
import * as path from 'path';

import * as winston from 'winston';

const LOGS_DIR = path.resolve('output/logs');

// Must exist before any File transport tries to open a file handle.
// mkdirSync is synchronous — safe to call at module load time.
try {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
} catch {
  // If we genuinely cannot create the directory (permissions, read-only FS)
  // we still want the test run to proceed — just without file logging.
}

// ─── Formats ─────────────────────────────────────────────────────────────────

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

/** Human-readable coloured output for the developer terminal. */
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp: ts, level, message, stack, ...meta }) => {
    const metaPart = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    // When an Error is logged, append the stack trace on a new line.
    const stackPart = stack ? `\n${stack}` : '';
    return `${ts} ${level}: ${message}${metaPart}${stackPart}`;
  }),
);

/** Structured JSON for log aggregation tools (Datadog, ELK, grep). */
const fileFormat = combine(timestamp(), errors({ stack: true }), json());

// ─── Transports ──────────────────────────────────────────────────────────────

const fileTransportOptions = {
  format: fileFormat,
  maxsize: 10 * 1024 * 1024, // 10 MB per file
  maxFiles: 5, // keep last 5 rotations
  tailable: true, // newest data always in the base filename
};

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: consoleFormat,
    // Suppress console when caller explicitly opts out (e.g. piped scripts).
    silent: process.env.LOG_SILENT === 'true',
  }),
];

// Add file transports only when the directory is available.
if (fs.existsSync(LOGS_DIR)) {
  transports.push(
    new winston.transports.File({
      ...fileTransportOptions,
      filename: path.join(LOGS_DIR, 'execution.log'),
    }),
    new winston.transports.File({
      ...fileTransportOptions,
      filename: path.join(LOGS_DIR, 'errors.log'),
      level: 'error',
    }),
  );
}

// ─── Logger instance ─────────────────────────────────────────────────────────

export const Logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  defaultMeta: { service: 'codecept-hybrid' },
  transports,
  // Unhandled exceptions / promise rejections → separate log files so CI
  // alerting can watch a single file without scanning execution.log.
  exceptionHandlers: fs.existsSync(LOGS_DIR)
    ? [
        new winston.transports.File({
          filename: path.join(LOGS_DIR, 'exceptions.log'),
          format: fileFormat,
        }),
      ]
    : [],
  rejectionHandlers: fs.existsSync(LOGS_DIR)
    ? [
        new winston.transports.File({
          filename: path.join(LOGS_DIR, 'rejections.log'),
          format: fileFormat,
        }),
      ]
    : [],
  // Never call process.exit() on a handled exception — let the test runner
  // decide whether to abort.
  exitOnError: false,
});

/**
 * Returns a child logger that merges `context` into every log entry.
 * Use this inside helpers, step objects, or services to stamp all their logs
 * with a common identifier (e.g. `{ component: 'RestHelper', testId: '...' }`).
 */
export function createChildLogger(context: Record<string, unknown>): winston.Logger {
  return Logger.child(context);
}
