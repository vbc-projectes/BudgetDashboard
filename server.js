/**
 * server.js — Express entry point for Docker/web deployment
 * Replaces Electron's main.js when running in web mode.
 * SQLite data is persisted in USERS_ROOT (mounted as Docker volume).
 */

'use strict';

const express = require('express');
const path = require('path');
const config = require('./src/config/config');
const {
    securityMiddleware,
    timeoutMiddleware,
    errorHandler,
    notFoundHandler
} = require('./src/middleware/index');
const routes = require('./src/routes/index');

const app = express();

// ── Trust proxy (Nginx / Caddy / Traefik) ───────────────────────────
if (config.TRUST_PROXY) {
    app.set('trust proxy', config.TRUST_PROXY);
}

// ── Body parsers ────────────────────────────────────────────────────
app.use(express.json({ limit: config.BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: config.BODY_LIMIT }));

// ── Security / CORS / timeout ────────────────────────────────────────
app.use(securityMiddleware);
app.use(timeoutMiddleware);

// ── Static frontend ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ───────────────────────────────────────────────────────
app.use('/', routes);

// ── SPA fallback: serve index.html for any non-API GET ───────────────
const API_PREFIXES = [
    '/api/', '/add/', '/update/', '/delete/', '/import/', '/sell/',
    '/widget/', '/users/', '/dashboard', '/ahorros', '/categorias',
    '/gastos', '/ingresos', '/impuestos', '/presupuestos', '/bolsa',
    '/cuenta', '/sub_huchas', '/hucha', '/backup', '/assets',
];
app.get('*', (req, res, next) => {
    if (API_PREFIXES.some(p => req.path.startsWith(p))) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error handling ───────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

const { runMigrations } = require('./src/database/migrationRunner');
const {
    readLastUser,
    ensureUserFolders
} = require('./src/config/userManager');
const db = require('./src/config/database');
const logger = require('./src/utils/logger');

// ── Start ────────────────────────────────────────────────────────────
const PORT = config.PORT;
app.listen(PORT, async () => {
    logger.info(`DashboardEconomic listening on http://localhost:${PORT}`);
    logger.info(`env=${config.NODE_ENV}  users_root=${config.USERS_ROOT}`);

    // If there is a last-used user, switch to their DB and run migrations.
    // Otherwise run migrations on the default DB so the schema is always current.
    try {
        const lastUser = readLastUser();
        if (lastUser) {
            const paths = ensureUserFolders(lastUser);
            await db.__setDbPath(paths.dbPath);
            logger.info(`Resuming session for user: ${lastUser}`);
        }
        await runMigrations();
    } catch (err) {
        logger.error('Startup migration failed:', err.message);
    }
});

module.exports = app;
