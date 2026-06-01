'use strict';

/**
 * Minimal structured logger.
 * Log level is controlled by LOG_LEVEL env var (error|warn|info|debug).
 * Defaults to 'info' in development and 'warn' in production.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const currentLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

function stamp(level) {
    return `[${level.toUpperCase().padEnd(5)}] ${new Date().toISOString()}`;
}

function emit(level, args) {
    if (LEVELS[level] > currentLevel) return;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(stamp(level), ...args);
}

const logger = {
    error: (...a) => emit('error', a),
    warn:  (...a) => emit('warn',  a),
    info:  (...a) => emit('info',  a),
    debug: (...a) => emit('debug', a),
};

module.exports = logger;
